import type { Book, NewBookInput, UpdateBookInput } from '../../types';
import { generateUuid } from '../../utils/backup';
import {
  cacheBookCover,
  deleteCoverIfUnused,
} from '../covers/coverCacheService';
import type { BookRepository, ImportMode, ImportSummary } from './BookRepository';
import { db, type HomeLibraryDatabase } from './db';

export class IndexedDbBookRepository implements BookRepository {
  private readonly database: HomeLibraryDatabase;

  constructor(database: HomeLibraryDatabase = db) {
    this.database = database;
  }

  async getAll(): Promise<Book[]> {
    const books = await this.database.books.toArray();
    return books.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getById(id: string): Promise<Book | undefined> {
    return this.database.books.get(id);
  }

  async findByIsbn13(isbn13: string): Promise<Book[]> {
    return this.database.books.where('isbn13').equals(isbn13).toArray();
  }

  async create(input: NewBookInput): Promise<Book> {
    const now = new Date().toISOString();
    const book: Book = {
      ...input,
      id: generateUuid(),
      language: input.language || 'cs',
      lentTo: input.readingStatus === 'lent' ? input.lentTo : undefined,
      createdAt: now,
      updatedAt: now,
    };

    await this.database.books.add(book);

    if (book.coverUrl) {
      void cacheBookCover(book.isbn13, book.coverUrl);
    }

    return book;
  }

  async update(id: string, patch: UpdateBookInput): Promise<Book> {
    const existing = await this.database.books.get(id);
    if (!existing) {
      throw new Error(`Kniha s ID "${id}" nebyla nalezena.`);
    }

    const nextStatus = patch.readingStatus ?? existing.readingStatus;
    const updated: Book = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      lentTo:
        nextStatus === 'lent'
          ? patch.lentTo !== undefined
            ? patch.lentTo
            : existing.lentTo
          : undefined,
      updatedAt: new Date().toISOString(),
    };

    await this.database.books.put(updated);

    if (updated.coverUrl && updated.coverUrl !== existing.coverUrl) {
      void cacheBookCover(updated.isbn13, updated.coverUrl);
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.database.books.get(id);
    await this.database.books.delete(id);

    if (existing) {
      await deleteCoverIfUnused(existing.isbn13);
    }
  }

  async importBooks(books: Book[], mode: ImportMode): Promise<ImportSummary> {
    let added = 0;
    let updated = 0;
    let skipped = 0;

    await this.database.transaction(
      'rw',
      this.database.books,
      this.database.covers,
      async () => {
        if (mode === 'replace') {
          await this.database.books.clear();
          await this.database.covers.clear();
          if (books.length > 0) {
            await this.database.books.bulkPut(books);
          }
          added = books.length;
          return;
        }

        const existingBooks = await this.database.books.toArray();
        const byId = new Map(existingBooks.map((b) => [b.id, b]));
        const byIsbn = new Map(existingBooks.map((b) => [b.isbn13, b]));

        for (const incoming of books) {
          const matchById = byId.get(incoming.id);
          const matchByIsbn = byIsbn.get(incoming.isbn13);

          if (matchById) {
            await this.database.books.put({
              ...incoming,
              updatedAt: new Date().toISOString(),
            });
            updated++;
          } else if (matchByIsbn) {
            skipped++;
          } else {
            await this.database.books.add(incoming);
            byId.set(incoming.id, incoming);
            byIsbn.set(incoming.isbn13, incoming);
            added++;
          }
        }
      }
    );

    for (const book of books) {
      if (book.coverUrl) {
        void cacheBookCover(book.isbn13, book.coverUrl);
      }
    }

    return { added, updated, skipped };
  }

  async clear(): Promise<void> {
    await this.database.books.clear();
    await this.database.covers.clear();
  }
}
