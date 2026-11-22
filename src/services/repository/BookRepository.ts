import type { Book, NewBookInput, UpdateBookInput } from '../../types';

export type ImportMode = 'merge' | 'replace';

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: number;
}

/**
 * Abstrakce nad datovým úložištěm knih.
 * Krok 1 používá IndexedDB (Dexie), v budoucnu lze bez změny UI doplnit cloudovou synchronizaci.
 */
export interface BookRepository {
  getAll(): Promise<Book[]>;
  getById(id: string): Promise<Book | undefined>;
  findByIsbn13(isbn13: string): Promise<Book[]>;
  create(input: NewBookInput): Promise<Book>;
  update(id: string, patch: UpdateBookInput): Promise<Book>;
  delete(id: string): Promise<void>;
  importBooks(books: Book[], mode: ImportMode): Promise<ImportSummary>;
  clear(): Promise<void>;
}
