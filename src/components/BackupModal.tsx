import { Download, FileJson, Upload, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import type { ImportMode, ImportSummary } from '../services/repository';
import type { Book } from '../types';
import { downloadBackupJson, parseBackupJson } from '../utils/backup';

interface BackupModalProps {
  open: boolean;
  books: Book[];
  onImport: (books: Book[], mode: ImportMode) => Promise<ImportSummary>;
  onNotify: (message: string) => void;
  onClose: () => void;
}

export function BackupModal({
  open,
  books,
  onImport,
  onNotify,
  onClose,
}: BackupModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [parsedBooks, setParsedBooks] = useState<Book[] | null>(null);
  const [skippedInvalid, setSkippedInvalid] = useState(0);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  const handleExport = () => {
    const filename = downloadBackupJson(books);
    onNotify(`Záloha uložena jako ${filename}`);
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setParsedBooks(null);
    setSkippedInvalid(0);

    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const text = await file.text();
    const result = parseBackupJson(text);

    if (!result.valid) {
      setError(result.error);
      return;
    }

    if (result.books.length === 0) {
      setError('Soubor neobsahuje žádné platné záznamy knih.');
      return;
    }

    setParsedBooks(result.books);
    setSkippedInvalid(result.skippedCount);
  };

  const handleConfirmImport = async () => {
    if (!parsedBooks) return;
    setImporting(true);
    setError(null);
    try {
      const summary = await onImport(parsedBooks, importMode);
      const parts: string[] = [];
      if (summary.added > 0) parts.push(`přidáno: ${summary.added}`);
      if (summary.updated > 0) parts.push(`aktualizováno: ${summary.updated}`);
      if (summary.skipped > 0) parts.push(`přeskočeno duplicit: ${summary.skipped}`);
      onNotify(`Import dokončen (${parts.join(', ') || 'beze změn'}).`);
      setParsedBooks(null);
      setSelectedFileName(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import se nezdařil.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-stone-950/50 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
    >
      <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-amber-800" />
            <h2 id="backup-modal-title" className="text-lg font-bold text-stone-900">
              Záloha knihovny (JSON)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="rounded-full p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Export */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
            <h3 className="text-sm font-semibold text-stone-900">Exportovat data</h3>
            <p className="mt-1 text-xs text-stone-500">
              Stáhne kompletní zálohu vaší knihovny ({books.length} záznamů) ve formátu JSON.
            </p>
            <button
              type="button"
              onClick={handleExport}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              <Download className="h-4 w-4" />
              <span>Stáhnout zálohu (.json)</span>
            </button>
          </div>

          {/* Import */}
          <div className="rounded-2xl border border-stone-200 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Importovat ze zálohy</h3>
              <p className="mt-1 text-xs text-stone-500">
                Nahrajte dříve stažený <code className="font-mono">.json</code> soubor.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setImportMode('merge')}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                  importMode === 'merge'
                    ? 'border-amber-700 bg-amber-50 font-semibold text-amber-900'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                Sloučit
                <span className="mt-0.5 block font-normal text-stone-500">
                  Doplní nové knihy
                </span>
              </button>
              <button
                type="button"
                onClick={() => setImportMode('replace')}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                  importMode === 'replace'
                    ? 'border-red-600 bg-red-50 font-semibold text-red-900'
                    : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                Nahradit vše
                <span className="mt-0.5 block font-normal text-stone-500">
                  Přepíše stávající
                </span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleFileSelect(e)}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700 transition hover:border-amber-700 hover:bg-amber-50/40"
            >
              <Upload className="h-4 w-4 text-stone-500" />
              <span>{selectedFileName ?? 'Vybrat soubor .json'}</span>
            </button>

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {error}
              </p>
            )}

            {parsedBooks && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900">
                <p className="font-semibold">
                  Připraveno k importu: {parsedBooks.length} knih
                </p>
                {skippedInvalid > 0 && (
                  <p className="mt-0.5 text-emerald-800">
                    ({skippedInvalid} neplatných záznamů bude přeskočeno)
                  </p>
                )}
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => void handleConfirmImport()}
                  className="mt-2.5 w-full rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                >
                  {importing ? 'Importuji…' : 'Potvrdit import'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
