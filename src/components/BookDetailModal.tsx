import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  Hash,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { lookupBookMetadata } from '../services/metadata';
import {
  BOOK_SOURCE_LABELS,
  READING_STATUS_LABELS,
  type Book,
  type ReadingStatus,
  type UpdateBookInput,
} from '../types';
import { formatIsbn13 } from '../utils/isbn';
import { BookCover } from './BookCover';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusBadge } from './StatusBadge';

interface BookDetailModalProps {
  book: Book | null;
  existingLocations: string[];
  onClose: () => void;
  onEdit: (book: Book) => void;
  onQuickUpdate: (id: string, patch: UpdateBookInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const STATUSES: ReadingStatus[] = ['unread', 'reading', 'read', 'lent'];

function isLongDescription(text?: string): boolean {
  if (!text) return false;
  const lineCount = text.split('\n').length;
  return text.length > 260 || lineCount > 5;
}

export function BookDetailModal({
  book,
  existingLocations,
  onClose,
  onEdit,
  onQuickUpdate,
  onDelete,
}: BookDetailModalProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quickLocation, setQuickLocation] = useState('');
  const [quickLentTo, setQuickLentTo] = useState('');
  const [savingQuick, setSavingQuick] = useState(false);

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMessage, setEnrichMessage] = useState<string | null>(null);

  useEffect(() => {
    if (book) {
      setQuickLocation(book.location ?? '');
      setQuickLentTo(book.lentTo ?? '');
      setConfirmOpen(false);
      setDescriptionExpanded(false);
      setEnrichMessage(null);
    }
  }, [book]);

  if (!book) return null;

  const locationDirty = quickLocation.trim() !== (book.location ?? '');
  const lentDirty =
    book.readingStatus === 'lent' && quickLentTo.trim() !== (book.lentTo ?? '');

  const handleStatusChange = async (nextStatus: ReadingStatus) => {
    setSavingQuick(true);
    try {
      await onQuickUpdate(book.id, {
        readingStatus: nextStatus,
        lentTo: nextStatus === 'lent' ? quickLentTo.trim() || undefined : undefined,
      });
    } finally {
      setSavingQuick(false);
    }
  };

  const handleSaveLocation = async () => {
    setSavingQuick(true);
    try {
      await onQuickUpdate(book.id, {
        location: quickLocation.trim() || undefined,
      });
    } finally {
      setSavingQuick(false);
    }
  };

  const handleSaveLentTo = async () => {
    setSavingQuick(true);
    try {
      await onQuickUpdate(book.id, {
        readingStatus: 'lent',
        lentTo: quickLentTo.trim() || undefined,
      });
    } finally {
      setSavingQuick(false);
    }
  };

  const handleEnrichMetadata = async () => {
    setEnriching(true);
    setEnrichMessage(null);
    try {
      const result = await lookupBookMetadata(book.isbn13, { skipCache: true });
      if (result.status !== 'found' || !result.data) {
        setEnrichMessage(
          result.message ?? 'V databázích nebyly nalezeny žádné další údaje.'
        );
        return;
      }

      const meta = result.data;
      const patch: UpdateBookInput = {};
      const updatedFields: string[] = [];

      if (!book.description && meta.description) {
        patch.description = meta.description;
        updatedFields.push('popis');
      }
      if (!book.coverUrl && meta.coverUrl) {
        patch.coverUrl = meta.coverUrl;
        updatedFields.push('obálka');
      }
      if (!book.pageCount && meta.pageCount) {
        patch.pageCount = meta.pageCount;
        updatedFields.push('počet stran');
      }
      if (!book.subtitle && meta.subtitle) {
        patch.subtitle = meta.subtitle;
        updatedFields.push('podnázev');
      }
      if (!book.publisher && meta.publisher) {
        patch.publisher = meta.publisher;
        updatedFields.push('nakladatel');
      }
      if (!book.publishedYear && meta.publishedYear) {
        patch.publishedYear = meta.publishedYear;
        updatedFields.push('rok vydání');
      }
      if (
        (book.authors.length === 0 ||
          (book.authors.length === 1 && book.authors[0] === 'Neznámý autor')) &&
        meta.authors &&
        meta.authors.length > 0
      ) {
        patch.authors = meta.authors;
        updatedFields.push('autoři');
      }

      if (updatedFields.length === 0) {
        setEnrichMessage('Kniha už má všechny dostupné údaje vyplněné.');
        return;
      }

      await onQuickUpdate(book.id, patch);
      setEnrichMessage(`Doplněno: ${updatedFields.join(', ')}.`);
    } finally {
      setEnriching(false);
    }
  };

  const longDesc = isLongDescription(book.description);

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-end justify-center bg-stone-950/50 backdrop-blur-xs sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-detail-title"
      >
        <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
          {/* Hlavička */}
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Detail knihy
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Zavřít detail"
              className="rounded-full p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Obsah */}
          <div className="overflow-y-auto px-5 py-5 space-y-5">
            {/* Hlavní info */}
            <div className="flex gap-4">
              <BookCover
                bookId={book.id}
                isbn13={book.isbn13}
                title={book.title}
                authors={book.authors}
                coverUrl={book.coverUrl}
                className="h-32 w-24"
              />

              <div className="min-w-0 flex-1">
                <h2
                  id="book-detail-title"
                  className="text-xl font-bold leading-snug text-stone-900"
                >
                  {book.title}
                </h2>
                {book.subtitle && (
                  <p className="mt-0.5 text-sm text-stone-500">{book.subtitle}</p>
                )}
                <p className="mt-1.5 text-sm font-medium text-stone-700">
                  {book.authors.join(', ')}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={book.readingStatus} lentTo={book.lentTo} size="md" />
                </div>
              </div>
            </div>

            {/* Anotace / popis knihy */}
            {book.description && (
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  O knize (anotace)
                </p>
                <p
                  className={`mt-1.5 whitespace-pre-line text-sm leading-relaxed text-stone-700 ${
                    longDesc && !descriptionExpanded ? 'line-clamp-5' : ''
                  }`}
                >
                  {book.description}
                </p>
                {longDesc && (
                  <button
                    type="button"
                    onClick={() => setDescriptionExpanded((prev) => !prev)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-950"
                  >
                    {descriptionExpanded ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" />
                        <span>Skrýt</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" />
                        <span>Zobrazit celý popis</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Zpětné doplnění údajů podle ISBN */}
            <div className="flex flex-col gap-2 rounded-2xl border border-stone-200/80 bg-stone-50/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-stone-600">
                {enrichMessage ?? 'Chybí anotace, obálka nebo počet stran?'}
              </div>
              <button
                type="button"
                disabled={enriching}
                onClick={() => void handleEnrichMetadata()}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-800 shadow-2xs transition hover:bg-stone-100 disabled:opacity-60"
              >
                {enriching ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Doplňuji…</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Doplnit údaje podle ISBN</span>
                  </>
                )}
              </button>
            </div>

            {/* Rychlá změna stavu */}
            <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3.5 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Rychlá změna stavu
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {STATUSES.map((status) => {
                    const active = book.readingStatus === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        disabled={savingQuick}
                        onClick={() => void handleStatusChange(status)}
                        className={`rounded-xl px-2.5 py-2 text-xs font-semibold transition ${
                          active
                            ? 'bg-stone-900 text-white shadow-xs'
                            : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {READING_STATUS_LABELS[status]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {book.readingStatus === 'lent' && (
                <div>
                  <label
                    htmlFor="quick-lent-to"
                    className="block text-xs font-medium text-indigo-800"
                  >
                    Komu je půjčená
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      id="quick-lent-to"
                      type="text"
                      value={quickLentTo}
                      onChange={(e) => setQuickLentTo(e.target.value)}
                      placeholder="Jméno osoby…"
                      className="flex-1 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    {lentDirty && (
                      <button
                        type="button"
                        disabled={savingQuick}
                        onClick={() => void handleSaveLentTo()}
                        className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Uložit
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Rychlá změna umístění */}
              <div>
                <label
                  htmlFor="quick-location"
                  className="block text-xs font-semibold uppercase tracking-wide text-stone-500"
                >
                  Umístění v bytě
                </label>
                <div className="mt-1 flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <input
                      id="quick-location"
                      type="text"
                      list="detail-locations"
                      value={quickLocation}
                      onChange={(e) => setQuickLocation(e.target.value)}
                      placeholder="např. Obývák - horní police"
                      className="w-full rounded-xl border border-stone-200 bg-white py-1.5 pl-9 pr-3 text-sm focus:border-amber-700 focus:outline-none"
                    />
                    <datalist id="detail-locations">
                      {existingLocations.map((loc) => (
                        <option key={loc} value={loc} />
                      ))}
                    </datalist>
                  </div>
                  {locationDirty && (
                    <button
                      type="button"
                      disabled={savingQuick}
                      onClick={() => void handleSaveLocation()}
                      className="inline-flex items-center gap-1 rounded-xl bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Uložit
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Metadata */}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
                <dt className="flex items-center gap-1.5 text-xs text-stone-500">
                  <Hash className="h-3.5 w-3.5" /> ISBN-13
                </dt>
                <dd className="mt-0.5 font-mono text-xs font-semibold text-stone-800">
                  {formatIsbn13(book.isbn13)}
                </dd>
              </div>

              {book.isbn10 && (
                <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
                  <dt className="flex items-center gap-1.5 text-xs text-stone-500">
                    <Hash className="h-3.5 w-3.5" /> ISBN-10
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs font-semibold text-stone-800">
                    {book.isbn10}
                  </dd>
                </div>
              )}

              {book.publisher && (
                <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
                  <dt className="text-xs text-stone-500">Nakladatelství</dt>
                  <dd className="mt-0.5 font-medium text-stone-800">{book.publisher}</dd>
                </div>
              )}

              {book.publishedYear && (
                <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
                  <dt className="flex items-center gap-1.5 text-xs text-stone-500">
                    <Calendar className="h-3.5 w-3.5" /> Rok vydání
                  </dt>
                  <dd className="mt-0.5 font-medium text-stone-800">{book.publishedYear}</dd>
                </div>
              )}

              {book.pageCount && (
                <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
                  <dt className="flex items-center gap-1.5 text-xs text-stone-500">
                    <FileText className="h-3.5 w-3.5" /> Počet stran
                  </dt>
                  <dd className="mt-0.5 font-medium text-stone-800">{book.pageCount}</dd>
                </div>
              )}

              {book.language && (
                <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
                  <dt className="flex items-center gap-1.5 text-xs text-stone-500">
                    <Globe className="h-3.5 w-3.5" /> Jazyk
                  </dt>
                  <dd className="mt-0.5 font-medium uppercase text-stone-800">
                    {book.language}
                  </dd>
                </div>
              )}

              {book.shelfTag && (
                <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
                  <dt className="flex items-center gap-1.5 text-xs text-stone-500">
                    <Tag className="h-3.5 w-3.5" /> Štítek / žánr
                  </dt>
                  <dd className="mt-0.5 font-medium text-stone-800">{book.shelfTag}</dd>
                </div>
              )}

              <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
                <dt className="text-xs text-stone-500">Zdroj záznamu</dt>
                <dd className="mt-0.5 font-medium text-stone-800">
                  {BOOK_SOURCE_LABELS[book.source]}
                </dd>
              </div>
            </dl>

            {book.notes && (
              <div className="rounded-2xl border border-stone-200 bg-amber-50/30 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Osobní poznámky
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                  {book.notes}
                </p>
              </div>
            )}
          </div>

          {/* Patička s akcemi */}
          <div className="flex items-center justify-between border-t border-stone-200 px-5 py-3.5">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>Smazat</span>
            </button>

            <button
              type="button"
              onClick={() => onEdit(book)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              <Pencil className="h-4 w-4" />
              <span>Upravit</span>
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Smazat knihu z knihovny?"
        description={`Opravdu chcete trvale odstranit knihu „${book.title}“? Tuto akci nelze vrátit zpět.`}
        confirmLabel="Ano, smazat"
        onConfirm={() => {
          setConfirmOpen(false);
          void onDelete(book.id);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
