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
  isbn13: string;
  blob: Blob;
  mimeType: string;
  savedAt: number;
}

export class HomeLibraryDatabase extends Dexie {
  books!: EntityTable<Book, 'id'>;
  lookupCache!: EntityTable<LookupCacheEntry, 'isbn13'>;
  covers!: EntityTable<CoverCacheEntry, 'isbn13'>;

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
  }
}

export const db = new HomeLibraryDatabase();
