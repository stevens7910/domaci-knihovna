import { Plus, RefreshCw, ScanBarcode } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { BackupModal } from '../components/BackupModal';
import { BookCard } from '../components/BookCard';
import { BookDetailModal } from '../components/BookDetailModal';
import { BookFormModal } from '../components/BookFormModal';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
import {
  BarcodeScanner,
  type BatchScanResult,
} from '../components/scanner/BarcodeScanner';
import { SearchAndFilters } from '../components/SearchAndFilters';
import { StatsBar } from '../components/StatsBar';
import { useBooks } from '../hooks/useBooks';
import { clearMetadataCache, lookupBookMetadata } from '../services/metadata';
import type { Book, NewBookInput, StatusFilter, UpdateBookInput } from '../types';
import { cleanIsbn, formatIsbn13 } from '../utils/isbn';
import { normalizeForSearch } from '../utils/text';

interface LibraryPageProps {
  onNotify: (message: string) => void;
}

export function LibraryPage({ onNotify }: LibraryPageProps) {
  const {
    books,
    loading,
    error,
    addBook,
    updateBook,
    deleteBook,
    findDuplicatesByIsbn13,
    importBooks,
  } = useBooks();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [locationFilter, setLocationFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [scannedIsbnForForm, setScannedIsbnForForm] = useState<string | null>(
    null
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const handleClearPwaCacheAndReload = async () => {
    setClearingCache(true);
    try {
      await clearMetadataCache();
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }
      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
      }
    } finally {
      window.location.reload();
    }
  };

  const selectedBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? null,
    [books, selectedBookId]
  );

  const existingLocations = useMemo(() => {
    const set = new Set<string>();
    for (const book of books) {
      if (book.location) set.add(book.location);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'cs'));
  }, [books]);

  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const book of books) {
      if (book.shelfTag) set.add(book.shelfTag);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'cs'));
  }, [books]);

  const statusCounts = useMemo<Record<StatusFilter, number>>(() => {
    const counts: Record<StatusFilter, number> = {
      all: books.length,
      unread: 0,
      reading: 0,
      read: 0,
      lent: 0,
    };
    for (const book of books) {
      counts[book.readingStatus]++;
    }
    return counts;
  }, [books]);

  const filteredBooks = useMemo(() => {
    const normalizedQuery = normalizeForSearch(searchQuery);
    const cleanedIsbnQuery = cleanIsbn(searchQuery);

    return books.filter((book) => {
      if (statusFilter !== 'all' && book.readingStatus !== statusFilter) {
        return false;
      }

      if (locationFilter && book.location !== locationFilter) {
        return false;
      }

      if (tagFilter && book.shelfTag !== tagFilter) {
        return false;
      }

      if (!normalizedQuery) return true;

      const haystack = normalizeForSearch(
        [
          book.title,
          book.subtitle ?? '',
          book.authors.join(' '),
          book.location ?? '',
          book.shelfTag ?? '',
          book.publisher ?? '',
          book.lentTo ?? '',
          book.notes ?? '',
        ].join(' ')
      );

      if (haystack.includes(normalizedQuery)) {
        return true;
      }

      if (
        cleanedIsbnQuery.length >= 3 &&
        (book.isbn13.includes(cleanedIsbnQuery) ||
          (book.isbn10 && book.isbn10.includes(cleanedIsbnQuery)))
      ) {
        return true;
      }

      return false;
    });
  }, [books, searchQuery, statusFilter, locationFilter, tagFilter]);

  const handleOpenCreate = () => {
    setEditingBook(null);
    setScannedIsbnForForm(null);
    setFormOpen(true);
  };

  const handleOpenScanner = () => {
    setFormOpen(false);
    setScannerOpen(true);
  };

  const handleStandardScan = useCallback((isbn13: string) => {
    setScannerOpen(false);
    setEditingBook(null);
    setScannedIsbnForForm(isbn13);
    setFormOpen(true);
  }, []);

  const handleBatchScan = useCallback(
    async (
      isbn13: string,
      defaultLocation?: string
    ): Promise<BatchScanResult> => {
      const existing = await findDuplicatesByIsbn13(isbn13);
      if (existing.length > 0) {
        const dup = existing[0];
        const msg = `Duplicita přeskočena: „${dup.title}“ už v knihovně je.`;
        onNotify(msg);
        return {
          status: 'duplicate',
          isbn13,
          title: dup.title,
          message: msg,
        };
      }

      const lookup = await lookupBookMetadata(isbn13);
      if (lookup.status === 'found' && lookup.data) {
        const meta = lookup.data;
        const created = await addBook({
          isbn13,
          isbn10: meta.isbn10,
          title: meta.title || `Kniha (ISBN ${formatIsbn13(isbn13)})`,
          subtitle: meta.subtitle,
          authors:
            meta.authors && meta.authors.length > 0
              ? meta.authors
              : ['Neznámý autor'],
          publisher: meta.publisher,
          publishedYear: meta.publishedYear,
          pageCount: meta.pageCount,
          language: meta.language || 'cs',
          coverUrl: meta.coverUrl,
          description: meta.description,
          location: defaultLocation,
          readingStatus: 'unread',
          source: meta.source || 'manual',
        });

        return {
          status: 'added',
          isbn13,
          title: created.title,
          message: `Uloženo: „${created.title}“ (${created.authors.join(', ')})`,
        };
      }

      // Pokud kniha nebyla v online databázích nalezena, uložíme ji s ISBN
      const fallbackTitle = `Kniha (ISBN ${formatIsbn13(isbn13)})`;
      const created = await addBook({
        isbn13,
        title: fallbackTitle,
        authors: ['Neznámý autor'],
        language: 'cs',
        location: defaultLocation,
        readingStatus: 'unread',
        source: 'manual',
      });

      return {
        status: 'added',
        isbn13,
        title: created.title,
        message: `Uloženo s ISBN ${formatIsbn13(isbn13)} (v databázích nenalezeno)`,
      };
    },
    [addBook, findDuplicatesByIsbn13, onNotify]
  );

  const handleOpenEdit = (book: Book) => {
    setSelectedBookId(null);
    setScannedIsbnForForm(null);
    setEditingBook(book);
    setFormOpen(true);
  };

  const handleFormSubmit = async (data: NewBookInput) => {
    if (editingBook) {
      await updateBook(editingBook.id, data);
      onNotify(`Kniha „${data.title}“ byla aktualizována.`);
    } else {
      await addBook(data);
      onNotify(`Kniha „${data.title}“ byla přidána do knihovny.`);
    }
  };

  const handleQuickUpdate = async (id: string, patch: UpdateBookInput) => {
    await updateBook(id, patch);
    onNotify('Změny byly uloženy.');
  };

  const handleDelete = async (id: string) => {
    const target = books.find((b) => b.id === id);
    await deleteBook(id);
    setSelectedBookId(null);
    onNotify(
      target ? `Kniha „${target.title}“ byla smazána.` : 'Kniha byla smazána.'
    );
  };

  return (
    <div className="min-h-screen pb-24 sm:pb-12">
      <Header
        totalCount={books.length}
        onAddClick={handleOpenCreate}
        onScanClick={handleOpenScanner}
        onBackupClick={() => setBackupOpen(true)}
      />

      <main className="mx-auto max-w-5xl px-4 pt-5 sm:px-6 space-y-5">
        {books.length > 0 && (
          <StatsBar
            counts={statusCounts}
            activeFilter={statusFilter}
            onSelectFilter={setStatusFilter}
          />
        )}

        <SearchAndFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          locationFilter={locationFilter}
          onLocationFilterChange={setLocationFilter}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          existingLocations={existingLocations}
          existingTags={existingTags}
          counts={statusCounts}
        />

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-36 animate-pulse rounded-2xl border border-stone-200 bg-white/80"
              />
            ))}
          </div>
        ) : filteredBooks.length === 0 ? (
          <EmptyState
            hasBooks={books.length > 0}
            onAddBook={handleOpenCreate}
            onResetFilters={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setLocationFilter('');
              setTagFilter('');
            }}
          />
        ) : (
          <section
            aria-label="Seznam knih"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {filteredBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onSelect={(b) => setSelectedBookId(b.id)}
                onQuickUpdate={handleQuickUpdate}
              />
            ))}
          </section>
        )}
      </main>

      {/* Zápatí s verzí buildu a tlačítkem pro vynucenou obnovu PWA cache */}
      <footer className="mx-auto mt-10 max-w-5xl px-4 pb-6 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-2.5 border-t border-stone-200/80 pt-4 text-xs text-stone-400 sm:flex-row">
          <span className="font-mono">
            Domácí knihovna •{' '}
            {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
          </span>
          <button
            type="button"
            disabled={clearingCache}
            onClick={() => void handleClearPwaCacheAndReload()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-2xs transition hover:bg-stone-50 hover:text-stone-900 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${clearingCache ? 'animate-spin' : ''}`}
            />
            <span>
              {clearingCache
                ? 'Čistím cache…'
                : 'Vyčistit cache a obnovit'}
            </span>
          </button>
        </div>
      </footer>

      {/* Plovoucí tlačítka pro mobily */}
      <div className="fixed bottom-6 right-4 z-30 flex items-center gap-2.5 sm:hidden">
        <button
          type="button"
          onClick={handleOpenScanner}
          aria-label="Skenovat ISBN"
          className="inline-flex h-14 items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-semibold text-white shadow-lg shadow-stone-950/30 transition hover:bg-stone-800 active:scale-95"
        >
          <ScanBarcode className="h-5 w-5" />
          <span>Skenovat ISBN</span>
        </button>

        <button
          type="button"
          onClick={handleOpenCreate}
          aria-label="Přidat novou knihu"
          className="inline-flex h-14 items-center gap-2 rounded-full bg-amber-800 px-4 text-sm font-semibold text-white shadow-lg shadow-amber-950/25 transition hover:bg-amber-900 active:scale-95"
        >
          <Plus className="h-5 w-5" />
          <span>Přidat</span>
        </button>
      </div>

      <BookFormModal
        open={formOpen}
        editingBook={editingBook}
        initialIsbn={scannedIsbnForForm}
        existingLocations={existingLocations}
        existingTags={existingTags}
        onFindDuplicates={findDuplicatesByIsbn13}
        onOpenExistingBook={(existing) => {
          setFormOpen(false);
          setSelectedBookId(existing.id);
        }}
        onOpenScanner={handleOpenScanner}
        onSubmit={handleFormSubmit}
        onClose={() => {
          setFormOpen(false);
          setScannedIsbnForForm(null);
        }}
      />

      <BarcodeScanner
        open={scannerOpen}
        existingLocations={existingLocations}
        onClose={() => setScannerOpen(false)}
        onSwitchToManual={() => {
          setScannerOpen(false);
          handleOpenCreate();
        }}
        onStandardScan={handleStandardScan}
        onBatchScan={handleBatchScan}
      />

      <BookDetailModal
        book={selectedBook}
        existingLocations={existingLocations}
        onClose={() => setSelectedBookId(null)}
        onEdit={handleOpenEdit}
        onQuickUpdate={handleQuickUpdate}
        onDelete={handleDelete}
      />

      <BackupModal
        open={backupOpen}
        books={books}
        onImport={importBooks}
        onNotify={onNotify}
        onClose={() => setBackupOpen(false)}
      />
    </div>
  );
}
