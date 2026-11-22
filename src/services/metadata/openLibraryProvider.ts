import { isbn13ToIsbn10 } from '../../utils/isbn';
import { cleanBookDescription } from '../../utils/text';
import { parsePublishedYear, sanitizeHttpsUrl } from './googleBooksProvider';
import type { BookMetadata, MetadataProvider } from './MetadataProvider';

type OpenLibraryTextValue = string | { value?: string } | undefined;

interface OpenLibraryBookEntry {
  title?: string;
  subtitle?: string;
  authors?: Array<{ name?: string } | string>;
  publishers?: Array<{ name?: string } | string>;
  publish_date?: string;
  number_of_pages?: number;
  description?: OpenLibraryTextValue;
  first_sentence?: OpenLibraryTextValue;
  notes?: OpenLibraryTextValue;
  excerpts?: Array<{ text?: string; comment?: string }>;
  cover?: {
    small?: string;
    medium?: string;
    large?: string;
  };
}

type OpenLibraryBooksResponse = Record<string, OpenLibraryBookEntry | undefined>;

function extractOpenLibraryText(field: OpenLibraryTextValue): string {
  if (!field) return '';
  if (typeof field === 'string') return cleanBookDescription(field);
  if (typeof field === 'object' && typeof field.value === 'string') {
    return cleanBookDescription(field.value);
  }
  return '';
}

function extractOpenLibraryDescription(entry: OpenLibraryBookEntry): string {
  const direct = extractOpenLibraryText(entry.description);
  if (direct) return direct;

  const fallbackParts: string[] = [];
  const firstSentence = extractOpenLibraryText(entry.first_sentence);
  if (firstSentence) fallbackParts.push(firstSentence);

  const excerptText = Array.isArray(entry.excerpts)
    ? entry.excerpts
        .map((ex) => (ex?.text ? cleanBookDescription(ex.text) : ''))
        .find(Boolean)
    : '';
  if (excerptText && excerptText !== firstSentence) {
    fallbackParts.push(excerptText);
  }

  const notesText = extractOpenLibraryText(entry.notes);
  if (notesText) fallbackParts.push(notesText);

  return fallbackParts.join('\n\n').trim();
}

export class OpenLibraryProvider implements MetadataProvider {
  readonly id = 'openlibrary' as const;
  readonly displayName = 'Open Library';

  private async verifyCoverUrl(
    isbn13: string,
    fallbackCover?: string,
    signal?: AbortSignal
  ): Promise<string | undefined> {
    const coverUrl = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn13)}-M.jpg?default=false`;
    const coverController = new AbortController();
    const timer = setTimeout(() => coverController.abort(), 2500);
    const onParentAbort = () => coverController.abort();
    signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      const response = await fetch(coverUrl, {
        method: 'HEAD',
        signal: coverController.signal,
      });
      if (response.ok) {
        return coverUrl;
      }
      return undefined;
    } catch {
      return sanitizeHttpsUrl(fallbackCover);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onParentAbort);
    }
  }

  async fetchByIsbn(
    isbn13: string,
    signal?: AbortSignal
  ): Promise<Partial<BookMetadata> | null> {
    const bibKey13 = `ISBN:${isbn13}`;
    const isbn10 = isbn13ToIsbn10(isbn13);
    const bibKey10 = isbn10 ? `ISBN:${isbn10}` : null;
    const bibKeys = bibKey10 ? `${bibKey13},${bibKey10}` : bibKey13;

    const url = `https://openlibrary.org/api/books?bibkeys=${bibKeys}&format=json&jscmd=data`;
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`Open Library API vrátilo HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OpenLibraryBooksResponse;
    const entry = payload?.[bibKey13] ?? (bibKey10 ? payload?.[bibKey10] : undefined);

    if (!entry) {
      return null;
    }

    const title = entry.title?.trim();
    const subtitle = entry.subtitle?.trim();

    const authors = Array.isArray(entry.authors)
      ? entry.authors
          .map((a) => (typeof a === 'string' ? a.trim() : a?.name?.trim() ?? ''))
          .filter(Boolean)
      : undefined;

    const publisher = Array.isArray(entry.publishers)
      ? entry.publishers
          .map((p) => (typeof p === 'string' ? p.trim() : p?.name?.trim() ?? ''))
          .find(Boolean)
      : undefined;

    const publishedYear = parsePublishedYear(entry.publish_date);
    const pageCount =
      typeof entry.number_of_pages === 'number' && entry.number_of_pages > 0
        ? entry.number_of_pages
        : undefined;

    const description = extractOpenLibraryDescription(entry);

    const coverUrl = await this.verifyCoverUrl(
      isbn13,
      entry.cover?.medium ?? entry.cover?.large ?? entry.cover?.small,
      signal
    );

    if (!title && (!authors || authors.length === 0) && !coverUrl && !description) {
      return null;
    }

    const result: Partial<BookMetadata> = {
      isbn13,
      source: 'openlibrary',
    };

    if (title) result.title = title;
    if (subtitle) result.subtitle = subtitle;
    if (authors && authors.length > 0) result.authors = authors;
    if (publisher) result.publisher = publisher;
    if (publishedYear !== undefined) result.publishedYear = publishedYear;
    if (pageCount !== undefined) result.pageCount = pageCount;
    if (coverUrl) result.coverUrl = coverUrl;
    if (description) result.description = description;

    return result;
  }
}

export const openLibraryProvider = new OpenLibraryProvider();
