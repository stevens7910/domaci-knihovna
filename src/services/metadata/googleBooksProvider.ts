import { cleanBookDescription } from '../../utils/text';
import type { BookMetadata, MetadataProvider } from './MetadataProvider';

interface GoogleBooksVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  language?: string;
  description?: string;
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
  };
  industryIdentifiers?: Array<{
    type?: string;
    identifier?: string;
  }>;
}

interface GoogleBooksResponse {
  totalItems?: number;
  items?: Array<{
    volumeInfo?: GoogleBooksVolumeInfo;
  }>;
}

export function sanitizeHttpsUrl(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^http:\/\//i, 'https://');
}

export function parsePublishedYear(rawDate?: string): number | undefined {
  if (!rawDate || typeof rawDate !== 'string') return undefined;
  const match = rawDate.match(/\b(\d{4})\b/);
  if (!match) return undefined;
  const year = Number(match[1]);
  return year >= 1000 && year <= 2100 ? year : undefined;
}

export class GoogleBooksProvider implements MetadataProvider {
  readonly id = 'googlebooks' as const;
  readonly displayName = 'Google Books';

  async fetchByIsbn(
    isbn13: string,
    signal?: AbortSignal
  ): Promise<Partial<BookMetadata> | null> {
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn13)}`;
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`Google Books API vrátilo HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GoogleBooksResponse;
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      return null;
    }

    // Preferujeme položku s přesnou shodou ISBN-13, jinak vezmeme první výsledek
    const matchedItem =
      payload.items.find((item) =>
        item.volumeInfo?.industryIdentifiers?.some(
          (idObj) => idObj.identifier?.replace(/[\s-]+/g, '') === isbn13
        )
      ) ?? payload.items[0];

    const info = matchedItem?.volumeInfo;
    if (!info) {
      return null;
    }

    const title = info.title?.trim();
    const subtitle = info.subtitle?.trim();
    const authors = Array.isArray(info.authors)
      ? info.authors.map((a) => String(a).trim()).filter(Boolean)
      : undefined;
    const publisher = info.publisher?.trim();
    const publishedYear = parsePublishedYear(info.publishedDate);
    const pageCount =
      typeof info.pageCount === 'number' && info.pageCount > 0
        ? info.pageCount
        : undefined;
    const language =
      typeof info.language === 'string' && info.language.trim()
        ? info.language.trim().toLowerCase()
        : undefined;
    const coverUrl = sanitizeHttpsUrl(
      info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail
    );
    const description = info.description
      ? cleanBookDescription(info.description)
      : '';

    if (!title && (!authors || authors.length === 0) && !coverUrl && !description) {
      return null;
    }

    const result: Partial<BookMetadata> = {
      isbn13,
      source: 'googlebooks',
    };

    if (title) result.title = title;
    if (subtitle) result.subtitle = subtitle;
    if (authors && authors.length > 0) result.authors = authors;
    if (publisher) result.publisher = publisher;
    if (publishedYear !== undefined) result.publishedYear = publishedYear;
    if (pageCount !== undefined) result.pageCount = pageCount;
    if (language) result.language = language;
    if (coverUrl) result.coverUrl = coverUrl;
    if (description) result.description = description;

    return result;
  }
}

export const googleBooksProvider = new GoogleBooksProvider();
