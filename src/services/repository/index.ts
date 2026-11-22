export type { BookRepository, ImportMode, ImportSummary } from './BookRepository';
export { IndexedDbBookRepository } from './IndexedDbBookRepository';
export { db, HomeLibraryDatabase } from './db';

import { IndexedDbBookRepository } from './IndexedDbBookRepository';
import type { BookRepository } from './BookRepository';

export const bookRepository: BookRepository = new IndexedDbBookRepository();
