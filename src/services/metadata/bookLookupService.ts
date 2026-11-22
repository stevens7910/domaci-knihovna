import { normalizeIsbn } from '../../utils/isbn';
import { db, type LookupCacheEntry } from '../repository/db';
import { customProxyProvider } from './customProxyProvider';
import { googleBooksProvider } from './googleBooksProvider';
import {
  MetadataProviderError,
  type BookMetadata,
  type MetadataProvider,
  type ProviderAttemptDiagnostic,
} from './MetadataProvider';
import { nkcrProvider } from './nkcrProvider';
import { obalkyKnihProvider } from './obalkyKnihProvider';
import { openLibraryProvider } from './openLibraryProvider';

export const METADATA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dní
export const DEFAULT_PROVIDER_TIMEOUT_MS = 5000; // 5 000 ms
const CURRENT_CACHE_VERSION = 3;

export type BookLookupStatus = 'found' | 'not_found' | 'offline' | 'error';

export interface BookLookupResult {
  status: BookLookupStatus;
  data?: Partial<BookMetadata>;
  message?: string;
  cached?: boolean;
  diagnostics: ProviderAttemptDiagnostic[];
}

export interface LookupBookOptions {
  providers?: MetadataProvider[];
  timeoutMs?: number;
  skipCache?: boolean;
}

type VersionedCacheEntry = LookupCacheEntry & { cacheVersion?: number };

const memoryCache = new Map<string, VersionedCacheEntry>();

export function isCzechIsbn(isbn13: string): boolean {
  return isbn13.startsWith('97880') || isbn13.startsWith('97980');
}

async function getCachedMetadata(isbn13: string): Promise<Partial<BookMetadata> | null> {
  const now = Date.now();

  const memEntry = memoryCache.get(isbn13);
  if (memEntry) {
    if (
      memEntry.expiresAt > now &&
      memEntry.cacheVersion === CURRENT_CACHE_VERSION &&
      (memEntry.data.title || (memEntry.data.authors && memEntry.data.authors.length > 0))
    ) {
      return memEntry.data;
    }
    memoryCache.delete(isbn13);
  }

  try {
    const dbEntry = (await db.lookupCache.get(isbn13)) as VersionedCacheEntry | undefined;
    if (dbEntry) {
      if (
        dbEntry.expiresAt > now &&
        dbEntry.cacheVersion === CURRENT_CACHE_VERSION &&
        (dbEntry.data.title || (dbEntry.data.authors && dbEntry.data.authors.length > 0))
      ) {
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
  if (!data.title && (!data.authors || data.authors.length === 0)) {
    return;
  }

  const now = Date.now();
  const entry: VersionedCacheEntry = {
    isbn13,
    data,
    cachedAt: now,
    expiresAt: now + METADATA_CACHE_TTL_MS,
    cacheVersion: CURRENT_CACHE_VERSION,
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

function summarizeFoundFields(partial: Partial<BookMetadata>): string {
  const fields: string[] = [];
  if (partial.title) fields.push(`název „${partial.title}“`);
  if (partial.authors && partial.authors.length > 0) fields.push('autoři');
  if (partial.coverUrl) fields.push('obálka');
  if (partial.description) fields.push('anotace');
  if (partial.pageCount) fields.push(`${partial.pageCount} stran`);
  return fields.length > 0
    ? `Vráceno: ${fields.join(', ')}.`
    : 'Vrácena částečná metadata.';
}

/**
 * Zavolá jednoho poskytovatele metadat s časovým limitem (AbortController)
 * a vždy vrátí strukturovaný diagnostický záznam pokusu.
 */
async function executeProviderAttempt(
  provider: MetadataProvider,
  isbn13: string,
  timeoutMs: number
): Promise<{
  data: Partial<BookMetadata> | null;
  diagnostic: ProviderAttemptDiagnostic;
}> {
  const startedAt = Date.now();
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(
        new MetadataProviderError({
          outcome: 'timeout',
          detail: `Vypršel časový limit (${timeoutMs} ms).`,
        })
      );
    }, timeoutMs);
  });

  try {
    const partial = await Promise.race([
      provider.fetchByIsbn(isbn13, controller.signal),
      timeoutPromise,
    ]);
    const durationMs = Date.now() - startedAt;

    if (partial) {
      return {
        data: partial,
        diagnostic: {
          providerId: provider.id,
          provider: provider.displayName,
          outcome: 'ok',
          httpStatus: 200,
          detail: summarizeFoundFields(partial),
          durationMs,
        },
      };
    }

    return {
      data: null,
      diagnostic: {
        providerId: provider.id,
        provider: provider.displayName,
        outcome: 'empty',
        httpStatus: 200,
        detail: 'Kniha nebyla v tomto zdroji nalezena (0 záznamů).',
        durationMs,
      },
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;

    if (err instanceof MetadataProviderError) {
      return {
        data: null,
        diagnostic: {
          providerId: provider.id,
          provider: provider.displayName,
          outcome: err.outcome,
          httpStatus: err.httpStatus,
          detail: err.detail,
          durationMs,
        },
      };
    }

    const message = err instanceof Error ? err.message : 'Chyba spojení se zdrojem.';
    const isHttpMatch = message.match(/HTTP\s+(\d{3})/i);
    if (isHttpMatch) {
      return {
        data: null,
        diagnostic: {
          providerId: provider.id,
          provider: provider.displayName,
          outcome: 'http_error',
          httpStatus: Number.parseInt(isHttpMatch[1], 10),
          detail: message,
          durationMs,
        },
      };
    }

    return {
      data: null,
      diagnostic: {
        providerId: provider.id,
        provider: provider.displayName,
        outcome: controller.signal.aborted ? 'timeout' : 'cors_or_network',
        detail: message,
        durationMs,
      },
    };
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
      diagnostics: [],
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
        diagnostics: [
          {
            providerId: cached.source ?? 'googlebooks',
            provider: 'Lokální mezipaměť (IndexedDB)',
            outcome: 'ok',
            detail: 'Načteno z lokální 7denní cache.',
          },
        ],
      };
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      status: 'offline',
      message: 'Zařízení je momentálně offline – knihu můžete doplnit ručně.',
      diagnostics: [],
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const diagnostics: ProviderAttemptDiagnostic[] = [];
  let merged: Partial<BookMetadata> | null = null;

  if (options.providers) {
    const activeProviders = options.providers.filter((p) =>
      typeof p.isEnabled === 'function' ? p.isEnabled() : true
    );

    for (const provider of activeProviders) {
      if (hasCompleteMetadata(merged)) {
        break;
      }
      const attempt = await executeProviderAttempt(provider, isbn13, timeoutMs);
      diagnostics.push(attempt.diagnostic);
      if (attempt.data) {
        merged = mergeBookMetadata(merged, attempt.data);
      }
    }
  } else if (isCzechIsbn(isbn13)) {
    // Pro české knihy (97880 / 97980) se nejprve paralelně ptáme NK ČR a Obálky knih
    const czechProviders: MetadataProvider[] = [
      ...(customProxyProvider.isEnabled() ? [customProxyProvider] : []),
      nkcrProvider,
      obalkyKnihProvider,
    ];

    const czechAttempts = await Promise.all(
      czechProviders.map((provider) =>
        executeProviderAttempt(provider, isbn13, timeoutMs)
      )
    );

    for (const attempt of czechAttempts) {
      diagnostics.push(attempt.diagnostic);
      if (attempt.data) {
        merged = mergeBookMetadata(merged, attempt.data);
      }
    }

    // Fallback na Google Books / Open Library, pokud české zdroje nic nenašly nebo chybí klíčová pole
    if (!merged || !hasCompleteMetadata(merged)) {
      const fallbackProviders: MetadataProvider[] = [
        googleBooksProvider,
        openLibraryProvider,
      ];

      for (const provider of fallbackProviders) {
        if (hasCompleteMetadata(merged)) {
          break;
        }
        const attempt = await executeProviderAttempt(provider, isbn13, timeoutMs);
        diagnostics.push(attempt.diagnostic);
        if (attempt.data) {
          merged = mergeBookMetadata(merged, attempt.data);
        }
      }
    }
  } else {
    // Pro zahraniční knihy: Google Books -> Open Library -> NK ČR
    const foreignProviders: MetadataProvider[] = [
      ...(customProxyProvider.isEnabled() ? [customProxyProvider] : []),
      googleBooksProvider,
      openLibraryProvider,
      nkcrProvider,
    ];

    for (const provider of foreignProviders) {
      if (hasCompleteMetadata(merged)) {
        break;
      }
      const attempt = await executeProviderAttempt(provider, isbn13, timeoutMs);
      diagnostics.push(attempt.diagnostic);
      if (attempt.data) {
        merged = mergeBookMetadata(merged, attempt.data);
      }
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
      diagnostics,
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      status: 'offline',
      message: 'Zařízení je momentálně offline – knihu můžete doplnit ručně.',
      diagnostics,
    };
  }

  const failedDiagnostics = diagnostics.filter(
    (d) => d.outcome !== 'ok' && d.outcome !== 'empty'
  );
  const corsOrNetworkFailures = diagnostics.filter(
    (d) => d.outcome === 'cors_or_network'
  );

  // Pokud selhaly všechny zdroje, nebo u českého ISBN selhal český katalog kvůli CORS/síti/chybě
  const czechPrimaryFailed =
    isCzechIsbn(isbn13) &&
    diagnostics.some(
      (d) =>
        (d.providerId === 'nkcr' || d.providerId === 'obalkyknih') &&
        d.outcome !== 'ok' &&
        d.outcome !== 'empty'
    );

  if (
    (failedDiagnostics.length > 0 &&
      failedDiagnostics.length === diagnostics.length) ||
    czechPrimaryFailed
  ) {
    const failedNames = failedDiagnostics
      .map((d) => `${d.provider} (${d.outcome})`)
      .join(', ');

    const message =
      corsOrNetworkFailures.length > 0
        ? `Nepodařilo se spojit s knižními databázemi (${failedNames}). Přímý dotaz z prohlížeče byl zablokován CORS nebo chybou sítě – nastavte vlastní proxy endpoint (VITE_BOOK_PROXY_URL) nebo knihu vyplňte ručně.`
        : `Nepodařilo se spojit s knižními databázemi (${failedNames}). Knihu můžete doplnit ručně.`;

    return {
      status: 'error',
      message,
      diagnostics,
    };
  }

  return {
    status: 'not_found',
    message: 'Kniha nebyla v databázích nalezena – můžete ji doplnit ručně.',
    diagnostics,
  };
}
