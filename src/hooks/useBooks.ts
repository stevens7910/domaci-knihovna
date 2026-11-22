import { useCallback, useEffect, useState } from 'react';
import {
  bookRepository,
  type ImportMode,
  type ImportSummary,
} from '../services/repository';
import type { Book, NewBookInput, UpdateBookInput } from '../types';

export function useBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    try {
      setError(null);
      const all = await bookRepository.getAll();
      setBooks(all);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Nepodařilo se načíst knihy z lokálního úložiště.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  const addBook = useCallback(async (input: NewBookInput): Promise<Book> => {
    const created = await bookRepository.create(input);
    setBooks((prev) => [created, ...prev]);
    return created;
  }, []);

  const updateBook = useCallback(
    async (id: string, patch: UpdateBookInput): Promise<Book> => {
      const updated = await bookRepository.update(id, patch);
      setBooks((prev) =>
        prev
          .map((item) => (item.id === id ? updated : item))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      );
      return updated;
    },
    []
  );

  const deleteBook = useCallback(async (id: string): Promise<void> => {
    await bookRepository.delete(id);
    setBooks((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const findDuplicatesByIsbn13 = useCallback(
    async (isbn13: string, excludeId?: string): Promise<Book[]> => {
      const matches = await bookRepository.findByIsbn13(isbn13);
      return excludeId ? matches.filter((b) => b.id !== excludeId) : matches;
    },
    []
  );

  const importBooks = useCallback(
    async (incoming: Book[], mode: ImportMode): Promise<ImportSummary> => {
      const summary = await bookRepository.importBooks(incoming, mode);
      await loadBooks();
      return summary;
    },
    [loadBooks]
  );

  return {
    books,
    loading,
    error,
    reload: loadBooks,
    addBook,
    updateBook,
    deleteBook,
    findDuplicatesByIsbn13,
    importBooks,
  };
}
