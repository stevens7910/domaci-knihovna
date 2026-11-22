import type { BookSource } from '../../types';

/**
 * Struktura knižních metadat získaných z externích databází.
 */
export interface BookMetadata {
  isbn13: string;
  isbn10?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publishedYear?: number;
  pageCount?: number;
  language?: string;
  coverUrl?: string;
  description?: string;
  source: Exclude<BookSource, 'manual'>;
}

/**
 * Společné rozhraní pro poskytovatele knižních metadat (Google Books, Open Library, vlastní proxy pro NK ČR).
 */
export interface MetadataProvider {
  readonly id: Exclude<BookSource, 'manual'>;
  readonly displayName: string;
  isEnabled?(): boolean;
  fetchByIsbn(isbn13: string, signal?: AbortSignal): Promise<Partial<BookMetadata> | null>;
}
