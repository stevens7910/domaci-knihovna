import Dexie, { type EntityTable } from 'dexie';
import type { Book } from '../../types';
import type { BookMetadata } from '../metadata/MetadataProvider';

export interface LookupCacheEntry {
  isbn13: string;
  data: Partial<BookMetadata>;
  cachedAt: number;
  expiresAt: number;
}

export interface CoverCacheEntry {
  bookId: string;
  blob: Blob;
  mimeType: string;
  updatedAt: string;
}

export class HomeLibraryDatabase extends Dexie {
  books!: EntityTable<Book, 'id'>;
  lookupCache!: EntityTable<LookupCacheEntry, 'isbn13'>;
  covers!: EntityTable<CoverCacheEntry, 'bookId'>;

  constructor() {
    super('DomaciKnihovnaDB');

    this.version(1).stores({
      books: 'id, isbn13, title, *authors, location, shelfTag, readingStatus, createdAt, updatedAt',
    });

    this.version(2).stores({
      books: 'id, isbn13, title, *authors, location, shelfTag, readingStatus, createdAt, updatedAt',
      lookupCache: 'isbn13, expiresAt',
    });

    this.version(3).stores({
      books: 'id, isbn13, title, *authors, location, shelfTag, readingStatus, createdAt, updatedAt',
      lookupCache: 'isbn13, expiresAt',
      covers: 'isbn13, savedAt',
    });

    // Bezpečná migrace primárního klíče tabulky covers z isbn13 na bookId bez smazání tabulky books
    this.version(4).stores({
      books: 'id, isbn13, title, *authors, location, shelfTag, readingStatus, createdAt, updatedAt',
      lookupCache: 'isbn13, expiresAt',
      covers: null,
    });

    this.version(5).stores({
      books: 'id, isbn13, title, *authors, location, shelfTag, readingStatus, createdAt, updatedAt',
      lookupCache: 'isbn13, expiresAt',
      covers: 'bookId, updatedAt',
    });
  }
}

export const db = new HomeLibraryDatabase();
