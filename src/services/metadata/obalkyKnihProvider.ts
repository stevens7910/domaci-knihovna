import { getIsbnSearchVariants } from '../../utils/isbn';
import { cleanBookDescription } from '../../utils/text';
import { buildRequestUrl, fetchWithBookProxy } from './corsFetch';
import { sanitizeHttpsUrl } from './googleBooksProvider';
import {
  MetadataProviderError,
  type BookMetadata,
  type MetadataProvider,
} from './MetadataProvider';

interface ObalkyKnihApiEntry {
  cover_preview510_url?: string;
  cover_medium_url?: string;
  cover_thumbnail_url?: string;
  bib_title?: string;
  bib_author?: string;
  bib_year?: string;
  csn_iso_690?: string;
  annotation?: {
    html?: string;
    source?: string;
  };
}

export function buildObalkyKnihUrl(isbn13: string): string {
  const variants = getIsbnSearchVariants(isbn13);
  const queries: Array<{ isbn: string }> = [{ isbn: variants?.isbn13 ?? isbn13 }];
  if (variants?.isbn10) {
    queries.push({ isbn: variants.isbn10 });
  }
  const multiParam = encodeURIComponent(JSON.stringify(queries));
  return `https://cache.obalkyknih.cz/api/books?multi=${multiParam}`;
}

export class ObalkyKnihProvider implements MetadataProvider {
  readonly id = 'obalkyknih' as const;
  readonly displayName = 'Obálky knih';
  private readonly proxyBaseUrl?: string;

  constructor(proxyBaseUrl?: string) {
    this.proxyBaseUrl = proxyBaseUrl;
  }

  getRequestUrl(isbn13: string): string {
    return buildRequestUrl({
      target: 'obalkyknih',
      isbn13,
      directUrl: buildObalkyKnihUrl(isbn13),
      proxyBaseUrl: this.proxyBaseUrl,
    }).requestUrl;
  }

  async fetchByIsbn(
    isbn13: string,
    signal?: AbortSignal
  ): Promise<Partial<BookMetadata> | null> {
    const apiUrl = buildObalkyKnihUrl(isbn13);
    const response = await fetchWithBookProxy({
      target: 'obalkyknih',
      isbn13,
      directUrl: apiUrl,
      signal,
      proxyBaseUrl: this.proxyBaseUrl,
    });

    let payload: unknown;
    let rawBody: string | undefined;
    try {
      if (typeof response.text === 'function') {
        rawBody = await response.text();
        payload = JSON.parse(rawBody);
      } else {
        payload = await response.json();
      }
    } catch {
      throw new MetadataProviderError({
        outcome: 'parse_error',
        requestUrl: this.getRequestUrl(isbn13),
        responseSnippet: rawBody,
        detail: 'Odpověď ze serveru Obálky knih není platný JSON.',
      });
    }

    if (!Array.isArray(payload)) {
      throw new MetadataProviderError({
        outcome: 'parse_error',
        requestUrl: this.getRequestUrl(isbn13),
        responseSnippet: rawBody ?? JSON.stringify(payload),
        detail: 'Očekáváno JSON pole ze serveru Obálky knih.',
      });
    }

    if (payload.length === 0) {
      return null;
    }

    // Sloučíme dostupná data ze všech vrácených záznamů (isbn13 i případně isbn10)
    let coverUrl: string | undefined;
    let description = '';
    let title: string | undefined;
    let authors: string[] | undefined;
    let publisher: string | undefined;
    let publishedYear: number | undefined;
    let pageCount: number | undefined;

    for (const rawItem of payload) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const entry = rawItem as ObalkyKnihApiEntry;

      if (!coverUrl) {
        coverUrl = sanitizeHttpsUrl(
          entry.cover_preview510_url ||
            entry.cover_medium_url ||
            entry.cover_thumbnail_url
        );
      }

      if (entry.annotation?.html) {
        const cleaned = cleanBookDescription(entry.annotation.html);
        if (cleaned.length > description.length) {
          description = cleaned;
        }
      }

      if (!title && entry.bib_title?.trim()) {
        title = entry.bib_title.trim();
      }

      if (!authors && entry.bib_author?.trim()) {
        const parsedAuthors = entry.bib_author
          .split(/\s*,\s*|\s*;\s*/)
          .map((a) => a.trim())
          .filter(Boolean);
        if (parsedAuthors.length > 0) {
          authors = parsedAuthors;
        }
      }

      if (publishedYear === undefined && entry.bib_year) {
        const match = String(entry.bib_year).match(/\d{4}/);
        if (match) {
          const parsed = Number.parseInt(match[0], 10);
          if (parsed >= 1000 && parsed <= 2100) {
            publishedYear = parsed;
          }
        }
      }

      if (entry.csn_iso_690) {
        const plainCit = cleanBookDescription(entry.csn_iso_690);
        if (!publisher) {
          // Typický formát ČSN ISO 690: "... Praha: Argo, 2020. ..."
          const pubMatch = plainCit.match(/:\s*([^,:]+),\s*\d{4}/);
          if (pubMatch?.[1]?.trim()) {
            publisher = pubMatch[1].trim();
          }
        }
        if (pageCount === undefined) {
          const pagesMatch = plainCit.match(
            /(\d+)\s*(?:nečíslovaných\s+)?s(?:tran|\.)/i
          );
          if (pagesMatch?.[1]) {
            const parsedPages = Number.parseInt(pagesMatch[1], 10);
            if (parsedPages > 0 && parsedPages < 10000) {
              pageCount = parsedPages;
            }
          }
        }
      }
    }

    if (!coverUrl && !description && !title && (!authors || authors.length === 0)) {
      return null;
    }

    const result: Partial<BookMetadata> = {
      isbn13,
      language: 'cs',
      source: 'obalkyknih',
    };

    if (title) result.title = title;
    if (authors && authors.length > 0) result.authors = authors;
    if (publisher) result.publisher = publisher;
    if (publishedYear !== undefined) result.publishedYear = publishedYear;
    if (pageCount !== undefined) result.pageCount = pageCount;
    if (coverUrl) result.coverUrl = coverUrl;
    if (description) result.description = description;

    return result;
  }
}

export const obalkyKnihProvider = new ObalkyKnihProvider();
