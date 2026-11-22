import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  ExternalLink,
  Info,
  Loader2,
  ScanBarcode,
  Search,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  lookupBookMetadata,
  type BookLookupStatus,
  type ProviderAttemptDiagnostic,
  type ProviderOutcome,
} from '../services/metadata';
import {
  BOOK_SOURCE_LABELS,
  READING_STATUS_LABELS,
  type Book,
  type BookSource,
  type NewBookInput,
  type ReadingStatus,
} from '../types';
import {
  formatIsbn13,
  normalizeIsbn,
  type IsbnSearchVariants,
} from '../utils/isbn';

interface BookFormModalProps {
  open: boolean;
  editingBook: Book | null;
  initialIsbn?: string | null;
  existingLocations: string[];
  existingTags: string[];
  onFindDuplicates: (isbn13: string, excludeId?: string) => Promise<Book[]>;
  onOpenExistingBook?: (book: Book) => void;
  onOpenScanner?: () => void;
  onSubmit: (data: NewBookInput) => Promise<void>;
  onClose: () => void;
}

const STATUS_OPTIONS: ReadingStatus[] = ['unread', 'reading', 'read', 'lent'];

const OUTCOME_BADGE_STYLES: Record<ProviderOutcome, string> = {
  ok: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  empty: 'bg-stone-100 text-stone-600 border-stone-200',
  cors_or_network: 'bg-red-100 text-red-800 border-red-200',
  http_error: 'bg-amber-100 text-amber-900 border-amber-200',
  parse_error: 'bg-rose-100 text-rose-800 border-rose-200',
  timeout: 'bg-orange-100 text-orange-800 border-orange-200',
};

export function BookFormModal({
  open,
  editingBook,
  initialIsbn,
  existingLocations,
  existingTags,
  onFindDuplicates,
  onOpenExistingBook,
  onOpenScanner,
  onSubmit,
  onClose,
}: BookFormModalProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [isbnInput, setIsbnInput] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [authorsInput, setAuthorsInput] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publishedYear, setPublishedYear] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [language, setLanguage] = useState('cs');
  const [coverUrl, setCoverUrl] = useState('');
  const [location, setLocation] = useState('');
  const [shelfTag, setShelfTag] = useState('');
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>('unread');
  const [lentTo, setLentTo] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [bookSource, setBookSource] = useState<BookSource>('manual');

  const [duplicates, setDuplicates] = useState<Book[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isbnTouched, setIsbnTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Stavy vyhledávání metadat podle ISBN
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<BookLookupStatus | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupCached, setLookupCached] = useState(false);
  const [lookupDiagnostics, setLookupDiagnostics] = useState<
    ProviderAttemptDiagnostic[]
  >([]);
  const [lookupVariants, setLookupVariants] =
    useState<IsbnSearchVariants | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [coverPreviewError, setCoverPreviewError] = useState(false);

  const runIsbnLookup = useCallback(async (rawIsbnToLookup: string) => {
    setIsbnTouched(true);
    setFormError(null);
    setLookupStatus(null);
    setLookupMessage(null);
    setLookupDiagnostics([]);
    setLookupVariants(null);

    const validation = normalizeIsbn(rawIsbnToLookup);
    if (!validation.valid) {
      setFormError(validation.error);
      return;
    }

    setLookingUp(true);
    try {
      const result = await lookupBookMetadata(rawIsbnToLookup);
      setLookupStatus(result.status);
      setLookupCached(Boolean(result.cached));
      setLookupDiagnostics(result.diagnostics ?? []);
      setLookupVariants(result.isbnVariants ?? null);
      setShowDiagnostics(result.status === 'error');

      if (result.status === 'found' && result.data) {
        const meta = result.data;
        if (meta.title) setTitle(meta.title);
        if (meta.subtitle !== undefined) setSubtitle(meta.subtitle ?? '');
        if (meta.authors && meta.authors.length > 0) {
          setAuthorsInput(meta.authors.join(', '));
        }
        if (meta.publisher !== undefined) setPublisher(meta.publisher ?? '');
        if (meta.publishedYear !== undefined) {
          setPublishedYear(String(meta.publishedYear));
        }
        if (meta.pageCount !== undefined) {
          setPageCount(String(meta.pageCount));
        }
        if (meta.language) setLanguage(meta.language);
        if (meta.coverUrl) {
          setCoverUrl(meta.coverUrl);
          setCoverPreviewError(false);
        }
        if (meta.description !== undefined) {
          setDescription(meta.description ?? '');
        }
        if (meta.source) {
          setBookSource(meta.source);
        }
        setLookupMessage(null);
      } else {
        setLookupMessage(
          result.message ??
            'Kniha nebyla v databázích nalezena – můžete ji doplnit ručně.'
        );
        window.setTimeout(() => {
          titleInputRef.current?.focus();
        }, 50);
      }
    } finally {
      setLookingUp(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    if (editingBook) {
      setIsbnInput(editingBook.isbn13);
      setTitle(editingBook.title);
      setSubtitle(editingBook.subtitle ?? '');
      setAuthorsInput(editingBook.authors.join(', '));
      setPublisher(editingBook.publisher ?? '');
      setPublishedYear(editingBook.publishedYear ? String(editingBook.publishedYear) : '');
      setPageCount(editingBook.pageCount ? String(editingBook.pageCount) : '');
      setLanguage(editingBook.language ?? 'cs');
      setCoverUrl(editingBook.coverUrl ?? '');
      setLocation(editingBook.location ?? '');
      setShelfTag(editingBook.shelfTag ?? '');
      setReadingStatus(editingBook.readingStatus);
      setLentTo(editingBook.lentTo ?? '');
      setDescription(editingBook.description ?? '');
      setNotes(editingBook.notes ?? '');
      setBookSource(editingBook.source);
    } else {
      setIsbnInput(initialIsbn ?? '');
      setTitle('');
      setSubtitle('');
      setAuthorsInput('');
      setPublisher('');
      setPublishedYear('');
      setPageCount('');
      setLanguage('cs');
      setCoverUrl('');
      setLocation('');
      setShelfTag('');
      setReadingStatus('unread');
      setLentTo('');
      setDescription('');
      setNotes('');
      setBookSource('manual');
    }

    setDuplicates([]);
    setFormError(null);
    setIsbnTouched(Boolean(initialIsbn));
    setLookingUp(false);
    setLookupStatus(null);
    setLookupMessage(null);
    setLookupCached(false);
    setLookupDiagnostics([]);
    setLookupVariants(null);
    setShowDiagnostics(false);
    setCoverPreviewError(false);

    if (!editingBook && initialIsbn) {
      void runIsbnLookup(initialIsbn);
    }
  }, [open, editingBook, initialIsbn, runIsbnLookup]);

  const isbnValidation = useMemo(() => normalizeIsbn(isbnInput), [isbnInput]);

  useEffect(() => {
    if (!open) return;
    if (!isbnValidation.valid) {
      setDuplicates([]);
      return;
    }

    let cancelled = false;
    void onFindDuplicates(isbnValidation.isbn13, editingBook?.id).then((matches) => {
      if (!cancelled) {
        setDuplicates(matches);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, isbnValidation, editingBook?.id, onFindDuplicates]);

  if (!open) return null;

  const handleCopyDiagnostics = async () => {
    const payload = {
      appVersion:
        typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
      timestamp: new Date().toISOString(),
      online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      isbnInput,
      isbnVariants: lookupVariants,
      status: lookupStatus,
      message: lookupMessage,
      diagnostics: lookupDiagnostics.map((d) => ({
        provider: d.provider,
        url: d.requestUrl,
        status: d.outcome,
        httpStatus: d.httpStatus,
        durationMs: d.durationMs,
        errorMessage: d.errorMessage ?? d.detail,
        responseSnippet: d.responseSnippet,
      })),
    };

    const jsonText = JSON.stringify(payload, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = jsonText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setDiagnosticsCopied(true);
      window.setTimeout(() => setDiagnosticsCopied(false), 2500);
    } catch {
      // Ignorovat chybu schránky
    }
  };

  const handleLookupIsbn = async () => {
    await runIsbnLookup(isbnInput);
  };

  const handleIsbnKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      void handleLookupIsbn();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
      typeof document !== 'undefined' &&
      document.activeElement?.id === 'book-isbn'
    ) {
      void handleLookupIsbn();
      return;
    }
    setIsbnTouched(true);
    setFormError(null);

    if (!isbnValidation.valid) {
      setFormError(isbnValidation.error);
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Vyplňte prosím název knihy.');
      titleInputRef.current?.focus();
      return;
    }

    const parsedAuthors = authorsInput
      .split(/[,;\n]+/)
      .map((a) => a.trim())
      .filter(Boolean);

    if (parsedAuthors.length === 0) {
      setFormError('Zadejte prosím alespoň jednoho autora.');
      return;
    }

    const parsedYear = publishedYear.trim() ? Number(publishedYear.trim()) : undefined;
    if (
      parsedYear !== undefined &&
      (!Number.isInteger(parsedYear) || parsedYear < 1000 || parsedYear > 2100)
    ) {
      setFormError('Rok vydání musí být celé číslo mezi 1000 a 2100.');
      return;
    }

    const parsedPages = pageCount.trim() ? Number(pageCount.trim()) : undefined;
    if (
      parsedPages !== undefined &&
      (!Number.isInteger(parsedPages) || parsedPages <= 0)
    ) {
      setFormError('Počet stran musí být kladné celé číslo.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        isbn13: isbnValidation.isbn13,
        isbn10: isbnValidation.isbn10 ?? editingBook?.isbn10,
        title: trimmedTitle,
        subtitle: subtitle.trim() || undefined,
        authors: parsedAuthors,
        publisher: publisher.trim() || undefined,
        publishedYear: parsedYear,
        pageCount: parsedPages,
        language: language.trim() || 'cs',
        coverUrl: coverUrl.trim() || undefined,
        location: location.trim() || undefined,
        shelfTag: shelfTag.trim() || undefined,
        readingStatus,
        lentTo: readingStatus === 'lent' ? lentTo.trim() || undefined : undefined,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        source: bookSource,
      });
      onClose();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Nepodařilo se uložit knihu.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-stone-950/50 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-form-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Hlavička */}
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 id="book-form-title" className="text-lg font-bold text-stone-900">
              {editingBook ? 'Upravit knihu' : 'Přidat novou knihu'}
            </h2>
            {bookSource !== 'manual' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                <Database className="h-3 w-3 text-amber-700" />
                <span>
                  Načteno z: {BOOK_SOURCE_LABELS[bookSource]}
                  {lookupCached ? ' (cache)' : ''}
                </span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít formulář"
            className="rounded-full p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulář */}
        <form onSubmit={handleSubmit} noValidate className="overflow-y-auto px-5 py-4 space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            >
              {formError}
            </div>
          )}

          {/* Rychlé vyhledávání podle ISBN / EAN */}
          <div className="rounded-2xl border border-stone-200/90 bg-stone-50/70 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="book-isbn" className="block text-sm font-semibold text-stone-800">
                ISBN-10 nebo ISBN-13 / EAN-13 <span className="text-red-500">*</span>
              </label>

              {onOpenScanner && (
                <button
                  type="button"
                  onClick={onOpenScanner}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-200/70"
                >
                  <ScanBarcode className="h-3.5 w-3.5" />
                  <span>Skenovat ISBN</span>
                </button>
              )}
            </div>
            <p className="mt-0.5 text-xs text-stone-500">
              Zadejte nebo naskenujte ISBN pro automatické načtení údajů z knižních databází.
            </p>

            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="book-isbn"
                type="text"
                inputMode="text"
                value={isbnInput}
                onChange={(e) => {
                  setIsbnInput(e.target.value);
                  setLookupStatus(null);
                  setLookupMessage(null);
                }}
                onBlur={() => setIsbnTouched(true)}
                onKeyDown={handleIsbnKeyDown}
                placeholder="např. 978-80-257-3282-3 nebo 0-306-40615-2"
                className={`flex-1 rounded-xl border px-3.5 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 ${
                  isbnInput && !isbnValidation.valid && isbnTouched
                    ? 'border-red-300 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20'
                    : isbnValidation.valid
                      ? 'border-emerald-300 bg-white focus:border-emerald-600 focus:ring-emerald-600/20'
                      : 'border-stone-200 bg-white focus:border-amber-700 focus:ring-amber-700/15'
                }`}
              />

              <button
                type="button"
                onClick={() => void handleLookupIsbn()}
                disabled={lookingUp}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-stone-800 disabled:opacity-60"
              >
                {lookingUp ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Hledám…</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    <span>Vyhledat podle ISBN</span>
                  </>
                )}
              </button>
            </div>

            {isbnValidation.valid && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Platné ISBN-13: <strong className="font-mono">{formatIsbn13(isbnValidation.isbn13)}</strong>
                  {isbnValidation.originalType === 'isbn10' && ' (převedeno z ISBN-10)'}
                </span>
              </p>
            )}

            {isbnTouched && !isbnValidation.valid && (
              <p className="mt-2 text-xs font-medium text-red-600">
                {isbnValidation.error}
              </p>
            )}

            {/* Skeleton / indikátor načítání */}
            {lookingUp && (
              <div
                role="status"
                className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs text-stone-600"
              >
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-800" />
                <span>Dotazuji knižní databáze (Google Books, Open Library)…</span>
              </div>
            )}

            {/* Úspěšně nalezeno */}
            {!lookingUp && lookupStatus === 'found' && (
              <div
                role="status"
                className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span>
                    Údaje o knize byly předvyplněny ze zdroje{' '}
                    <strong>{BOOK_SOURCE_LABELS[bookSource]}</strong>.
                  </span>
                </div>
              </div>
            )}

            {/* Nenalezeno / offline / chyba API */}
            {!lookingUp &&
              lookupStatus &&
              lookupStatus !== 'found' &&
              lookupMessage && (
                <div
                  role="status"
                  className={`mt-2.5 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                    lookupStatus === 'error'
                      ? 'border-amber-300 bg-amber-50/90 text-amber-950'
                      : 'border-stone-200 bg-white text-stone-700'
                  }`}
                >
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <span>{lookupMessage}</span>
                </div>
              )}

            {/* Rozklikávací detail: Diagnostika vyhledávání */}
            {!lookingUp && lookupDiagnostics.length > 0 && (
              <div className="mt-2.5 rounded-xl border border-stone-200 bg-white/90 text-xs">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics((prev) => !prev)}
                    className="flex flex-1 items-center gap-1.5 text-left font-medium text-stone-700 transition hover:text-stone-950"
                  >
                    <Wrench className="h-3.5 w-3.5 text-stone-500" />
                    <span>
                      Diagnostika vyhledávání ({lookupDiagnostics.length})
                    </span>
                    {showDiagnostics ? (
                      <ChevronUp className="h-4 w-4 text-stone-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-stone-400" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCopyDiagnostics()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    {diagnosticsCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Zkopírováno</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-stone-500" />
                        <span>Zkopírovat diagnostiku</span>
                      </>
                    )}
                  </button>
                </div>

                {showDiagnostics && (
                  <div className="border-t border-stone-100 px-3 py-2.5 space-y-2">
                    {lookupVariants && (
                      <div className="rounded-lg border border-amber-200/70 bg-amber-50/40 p-2 text-[11px] text-stone-700">
                        <p className="font-semibold text-stone-800">
                          Vygenerované varianty ISBN pro dotazy:
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[10px]">
                          <span className="rounded bg-white px-1.5 py-0.5 border border-stone-200">
                            isbn13: {lookupVariants.isbn13}
                          </span>
                          <span className="rounded bg-white px-1.5 py-0.5 border border-stone-200">
                            isbn13h: {lookupVariants.isbn13Hyphenated}
                          </span>
                          {lookupVariants.isbn10 && (
                            <span className="rounded bg-white px-1.5 py-0.5 border border-stone-200">
                              isbn10: {lookupVariants.isbn10}
                            </span>
                          )}
                          {lookupVariants.isbn10Hyphenated && (
                            <span className="rounded bg-white px-1.5 py-0.5 border border-stone-200">
                              isbn10h: {lookupVariants.isbn10Hyphenated}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {lookupDiagnostics.map((diag, idx) => (
                      <div
                        key={`${diag.providerId}-${idx}`}
                        className="rounded-lg border border-stone-100 bg-stone-50/70 p-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="font-semibold text-stone-800">
                            {diag.provider}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {diag.durationMs !== undefined && (
                              <span className="font-mono text-[10px] text-stone-500">
                                {diag.durationMs} ms
                              </span>
                            )}
                            {diag.httpStatus !== undefined && (
                              <span className="rounded bg-stone-200/80 px-1.5 py-0.5 font-mono text-[10px] text-stone-700">
                                HTTP {diag.httpStatus}
                              </span>
                            )}
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                OUTCOME_BADGE_STYLES[diag.outcome]
                              }`}
                            >
                              {diag.outcome}
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-stone-700">
                          {diag.detail}
                        </p>
                        {diag.requestUrl && (
                          <p className="mt-1 break-all font-mono text-[10px] text-stone-400">
                            URL: {decodeURIComponent(diag.requestUrl)}
                          </p>
                        )}
                        {diag.responseSnippet && (
                          <pre className="mt-1.5 max-h-24 overflow-x-auto whitespace-pre-wrap break-all rounded border border-stone-200/80 bg-white p-1.5 font-mono text-[10px] text-stone-600">
                            {diag.responseSnippet}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Kontrola duplicit */}
            {duplicates.length > 0 && (
              <div
                role="status"
                className="mt-2.5 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-semibold">
                      Kniha s tímto ISBN už je v knihovně!
                    </p>
                    <p className="mt-0.5 text-amber-800">
                      {duplicates
                        .map((d) => `„${d.title}“${d.location ? ` (${d.location})` : ''}`)
                        .join(', ')}
                      . Můžete otevřít existující záznam, nebo ji přesto uložit jako další výtisk.
                    </p>
                  </div>
                </div>
                {onOpenExistingBook && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenExistingBook(duplicates[0])}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 shadow-2xs transition hover:bg-amber-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Otevřít existující záznam</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Náhled obálky + Název a podnázev */}
          <div className="flex gap-3.5">
            {coverUrl.trim() && !coverPreviewError && (
              <div className="shrink-0 pt-1">
                <img
                  src={coverUrl}
                  alt="Náhled obálky"
                  onError={() => setCoverPreviewError(true)}
                  className="h-28 w-20 rounded-xl border border-stone-200 object-cover shadow-xs"
                />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <label htmlFor="book-title" className="block text-sm font-medium text-stone-800">
                  Název knihy <span className="text-red-500">*</span>
                </label>
                <input
                  ref={titleInputRef}
                  id="book-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="např. R.U.R."
                  required
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
                />
              </div>

              <div>
                <label htmlFor="book-subtitle" className="block text-sm font-medium text-stone-700">
                  Podnázev
                </label>
                <input
                  id="book-subtitle"
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Volitelný podnázev"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="book-authors" className="block text-sm font-medium text-stone-800">
              Autoři <span className="text-red-500">*</span>
            </label>
            <input
              id="book-authors"
              type="text"
              value={authorsInput}
              onChange={(e) => setAuthorsInput(e.target.value)}
              placeholder="Karel Čapek (více autorů oddělte čárkou)"
              required
              className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
            />
          </div>

          {/* Stav a umístění */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="book-status" className="block text-sm font-medium text-stone-700">
                Stav přečtení
              </label>
              <select
                id="book-status"
                value={readingStatus}
                onChange={(e) => setReadingStatus(e.target.value as ReadingStatus)}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {READING_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="book-location" className="block text-sm font-medium text-stone-700">
                Umístění v bytě
              </label>
              <input
                id="book-location"
                type="text"
                list="library-locations"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="např. Obývák - horní police"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
              />
              <datalist id="library-locations">
                {existingLocations.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>

            {readingStatus === 'lent' && (
              <div className="sm:col-span-2">
                <label htmlFor="book-lent-to" className="block text-sm font-medium text-indigo-800">
                  Komu je kniha půjčená
                </label>
                <input
                  id="book-lent-to"
                  type="text"
                  value={lentTo}
                  onChange={(e) => setLentTo(e.target.value)}
                  placeholder="např. Petr Novák"
                  className="mt-1 w-full rounded-xl border border-indigo-200 bg-indigo-50/40 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            )}

            <div>
              <label htmlFor="book-tag" className="block text-sm font-medium text-stone-700">
                Štítek / žánr
              </label>
              <input
                id="book-tag"
                type="text"
                list="library-tags"
                value={shelfTag}
                onChange={(e) => setShelfTag(e.target.value)}
                placeholder="např. Sci-fi, Beletrie"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
              />
              <datalist id="library-tags">
                {existingTags.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="book-publisher" className="block text-sm font-medium text-stone-700">
                Nakladatelství
              </label>
              <input
                id="book-publisher"
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                placeholder="např. Argo"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
              />
            </div>
          </div>

          {/* Doplňkové údaje */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="book-year" className="block text-sm font-medium text-stone-700">
                Rok vydání
              </label>
              <input
                id="book-year"
                type="number"
                inputMode="numeric"
                value={publishedYear}
                onChange={(e) => setPublishedYear(e.target.value)}
                placeholder="2024"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
              />
            </div>

            <div>
              <label htmlFor="book-pages" className="block text-sm font-medium text-stone-700">
                Počet stran
              </label>
              <input
                id="book-pages"
                type="number"
                inputMode="numeric"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                placeholder="320"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
              />
            </div>

            <div>
              <label htmlFor="book-language" className="block text-sm font-medium text-stone-700">
                Jazyk
              </label>
              <input
                id="book-language"
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="cs"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
              />
            </div>
          </div>

          <div>
            <label htmlFor="book-cover" className="block text-sm font-medium text-stone-700">
              URL obálky (volitelné)
            </label>
            <input
              id="book-cover"
              type="url"
              value={coverUrl}
              onChange={(e) => {
                setCoverUrl(e.target.value);
                setCoverPreviewError(false);
              }}
              placeholder="https://…"
              className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
            />
          </div>

          <div>
            <label htmlFor="book-description" className="block text-sm font-medium text-stone-700">
              Anotace / popis knihy
            </label>
            <textarea
              id="book-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Krátký popis obsahu knihy (předvyplní se automaticky při vyhledání podle ISBN)…"
              className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
            />
          </div>

          <div>
            <label htmlFor="book-notes" className="block text-sm font-medium text-stone-700">
              Poznámky
            </label>
            <textarea
              id="book-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Vlastní poznámky, věnování, stav knihy…"
              className="mt-1 w-full rounded-xl border border-stone-200 px-3.5 py-2 text-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
            />
          </div>

          {/* Tlačítka */}
          <div className="flex items-center justify-end gap-2 border-t border-stone-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-amber-800 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-amber-900 disabled:opacity-60"
            >
              {submitting
                ? 'Ukládám…'
                : editingBook
                  ? 'Uložit změny'
                  : 'Přidat knihu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
