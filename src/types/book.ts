export type ReadingStatus = 'unread' | 'reading' | 'read' | 'lent';

export type BookSource = 'manual' | 'openlibrary' | 'googlebooks' | 'nkcr' | 'obalkyknih';

export interface Book {
  id: string;
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
  location?: string;
  shelfTag?: string;
  readingStatus: ReadingStatus;
  lentTo?: string;
  description?: string;
  notes?: string;
  source: BookSource;
  createdAt: string;
  updatedAt: string;
}

export type NewBookInput = Omit<Book, 'id' | 'createdAt' | 'updatedAt'>;

export type UpdateBookInput = Partial<Omit<Book, 'id' | 'createdAt' | 'updatedAt'>>;

export type StatusFilter = 'all' | ReadingStatus;

export interface LibraryBackup {
  version: 1;
  exportedAt: string;
  books: Book[];
}

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: 'Nepřečteno',
  reading: 'Rozečteno',
  read: 'Přečteno',
  lent: 'Půjčeno',
};

export const BOOK_SOURCE_LABELS: Record<BookSource, string> = {
  manual: 'Ruční zadání',
  openlibrary: 'Open Library',
  googlebooks: 'Google Books',
  nkcr: 'NK ČR',
  obalkyknih: 'Obálky knih',
};
