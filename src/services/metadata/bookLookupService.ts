import { normalizeIsbn } from '../../utils/isbn';
import { db, type LookupCacheEntry } from '../repository/db';
import { customProxyProvider } from './customProxyProvider';
import { googleBooksProvider } from './googleBooksProvider';
import type { BookMetadata, MetadataProvider } from './MetadataProvider';
import { openLibraryProvider } from './openLibraryProvider';

export const METADATA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dní
export const DEFAULT_PROVIDER_TIMEOUT_MS = 5000; // 5 000 ms

export type BookLookupStatus = 'found' | 'not_found' | 'offline' | 'error';

export interface BookLookupResult {
  status: BookLookupStatus;
  data?: Partial<BookMetadata>;
  message?: string;
  cached?: boolean;
}

export interface LookupBookOptions {
  providers?: MetadataProvider[];
  timeoutMs?: number;
  skipCache?: boolean;
}

const memoryCache = new Map<string, LookupCacheEntry>();

async function getCachedMetadata(isbn13: string): Promise<Partial<BookMetadata> | null> {
  const now = Date.now();

  const memEntry = memoryCache.get(isbn13);
  if (memEntry) {
    if (memEntry.expiresAt > now) {
      return memEntry.data;
    }
    memoryCache.delete(isbn13);
  }

  try {
    const dbEntry = await db.lookupCache.get(isbn13);
    if (dbEntry) {
      if (dbEntry.expiresAt > now) {
        memoryCache.set(isbn13, dbEntry);
        return dbEntry.data;
      }
      await db.lookupCache.delete(isbn13);
    }
  } catch {
    // V prostředí bez IndexedDB (např. Node unit testy) tiše pokračujeme s in-memory cache
  }

  return null;
}

async function setCachedMetadata(
  isbn13: string,
  data: Partial<BookMetadata>
): Promise<void> {
  const now = Date.now();
  const entry: LookupCacheEntry = {
    isbn13,
    data,
    cachedAt: now,
    expiresAt: now + METADATA_CACHE_TTL_MS,
  };

  memoryCache.set(isbn13, entry);

  try {
    await db.lookupCache.put(entry);
  } catch {
    // V prostředí bez IndexedDB ignorujeme
  }
}

export async function clearMetadataCache(): Promise<void> {
  memoryCache.clear();
  try {
    await db.lookupCache.clear();
  } catch {
    // Ignorovat v Node prostředí
  }
}

/**
 * Zavolá jednoho poskytovatele metadat s časovým limitem (AbortController).
 */
async function fetchFromProviderWithTimeout(
  provider: MetadataProvider,
  isbn13: string,
  timeoutMs: number
): Promise<Partial<BookMetadata> | null> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout (${timeoutMs} ms) u zdroje ${provider.displayName}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      provider.fetchByIsbn(isbn13, controller.signal),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Zjistí, zda již máme všechna klíčová pole a není nutné dotazovat další záložní zdroj.
 */
function hasCompleteMetadata(data: Partial<BookMetadata> | null): boolean {
  if (!data) return false;
  return Boolean(
    data.title &&
      data.authors &&
      data.authors.length > 0 &&
      data.coverUrl &&
      data.pageCount &&
      data.description
  );
}

/**
 * Chytré sloučení (merge) metadat z primárního a sekundárního zdroje.
 * Atribut `source` se řídí zdrojem, ze kterého pochází název knihy (`title`).
 * U popisu (`description`) preferuje delší a obsažnější text.
 */
export function mergeBookMetadata(
  current: Partial<BookMetadata> | null,
  incoming: Partial<BookMetadata> | null
): Partial<BookMetadata> | null {
  if (!current) return incoming ? { ...incoming } : null;
  if (!incoming) return current;

  const primaryHasTitle = Boolean(current.title && current.title.trim());
  const incomingHasTitle = Boolean(incoming.title && incoming.title.trim());

  const resolvedSource = primaryHasTitle
    ? current.source
    : incomingHasTitle
      ? incoming.source
      : current.source ?? incoming.source;

  const currentDesc = current.description?.trim() ?? '';
  const incomingDesc = incoming.description?.trim() ?? '';
  const resolvedDescription =
    incomingDesc.length > currentDesc.length
      ? incomingDesc || undefined
      : currentDesc || undefined;

  return {
    isbn13: current.isbn13 ?? incoming.isbn13,
    isbn10: current.isbn10 ?? incoming.isbn10,
    title: primaryHasTitle ? current.title : incoming.title,
    subtitle: current.subtitle || incoming.subtitle,
    authors:
      current.authors && current.authors.length > 0
        ? current.authors
        : incoming.authors,
    publisher: current.publisher || incoming.publisher,
    publishedYear: current.publishedYear ?? incoming.publishedYear,
    pageCount: current.pageCount ?? incoming.pageCount,
    language: current.language || incoming.language,
    coverUrl: current.coverUrl || incoming.coverUrl,
    description: resolvedDescription,
    source: resolvedSource,
  };
}

/**
 * Hlavní orchestrátor pro vyhledání metadat knihy podle ISBN-10 / ISBN-13 / EAN-13.
 */
export async function lookupBookMetadata(
  rawIsbn: string,
  options: LookupBookOptions = {}
): Promise<BookLookupResult> {
  const normalized = normalizeIsbn(rawIsbn);
  if (!normalized.valid) {
    return {
      status: 'error',
      message: normalized.error,
    };
  }

  const { isbn13, isbn10 } = normalized;

  if (!options.skipCache) {
    const cached = await getCachedMetadata(isbn13);
    if (cached) {
      return {
        status: 'found',
        data: {
          ...cached,
          isbn13,
          isbn10: cached.isbn10 ?? isbn10,
        },
        cached: true,
      };
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      status: 'offline',
      message: 'Zařízení je momentálně offline – knihu můžete doplnit ručně.',
    };
  }

  const allProviders: MetadataProvider[] = options.providers ?? [
    customProxyProvider,
    googleBooksProvider,
    openLibraryProvider,
  ];

  const activeProviders = allProviders.filter((p) =>
    typeof p.isEnabled === 'function' ? p.isEnabled() : true
  );

  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;

  let merged: Partial<BookMetadata> | null = null;
  let errorCount = 0;
  let respondedCount = 0;

  for (const provider of activeProviders) {
    if (hasCompleteMetadata(merged)) {
      break;
    }

    try {
      const partial = await fetchFromProviderWithTimeout(
        provider,
        isbn13,
        timeoutMs
      );
      respondedCount++;
      if (partial) {
        merged = mergeBookMetadata(merged, partial);
      }
    } catch {
      errorCount++;
    }
  }

  if (merged && (merged.title || (merged.authors && merged.authors.length > 0))) {
    const finalData: Partial<BookMetadata> = {
      ...merged,
      isbn13,
      isbn10: merged.isbn10 ?? isbn10,
      language: merged.language ?? 'cs',
    };

    await setCachedMetadata(isbn13, finalData);

    return {
      status: 'found',
      data: finalData,
      cached: false,
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      status: 'offline',
      message: 'Zařízení je momentálně offline – knihu můžete doplnit ručně.',
    };
  }

  if (errorCount > 0 && respondedCount === 0) {
    return {
      status: 'error',
      message:
        'Nepodařilo se spojit s knižními databázemi (vypršel časový limit nebo došlo k chybě sítě). Knihu můžete doplnit ručně.',
    };
  }

  return {
    status: 'not_found',
    message: 'Kniha nebyla v databázích nalezena – můžete ji doplnit ručně.',
  };
}
