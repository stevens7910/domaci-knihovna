import { BookMarked, DatabaseBackup, Plus, ScanBarcode } from 'lucide-react';

interface HeaderProps {
  totalCount: number;
  onAddClick: () => void;
  onScanClick: () => void;
  onBackupClick: () => void;
}

function formatCzechBookCount(count: number): string {
  if (count === 1) return '1 kniha';
  if (count >= 2 && count <= 4) return `${count} knihy`;
  return `${count} knih`;
}

export function Header({
  totalCount,
  onAddClick,
  onScanClick,
  onBackupClick,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-[#faf8f5]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-800 text-amber-50 shadow-sm">
            <BookMarked className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-stone-900 sm:text-xl">
              Domácí knihovna
            </h1>
            <p className="text-xs font-medium text-stone-500">
              {formatCzechBookCount(totalCount)} • offline úložiště
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackupClick}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-xs transition hover:bg-stone-50 active:scale-[0.98]"
            aria-label="Export a import zálohy"
          >
            <DatabaseBackup className="h-4 w-4 text-stone-500" />
            <span className="hidden md:inline">Záloha</span>
          </button>

          <button
            type="button"
            onClick={onScanClick}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-stone-800 active:scale-[0.98]"
          >
            <ScanBarcode className="h-4 w-4" />
            <span>Skenovat ISBN</span>
          </button>

          <button
            type="button"
            onClick={onAddClick}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-amber-800 px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-amber-900 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>Přidat knihu</span>
          </button>
        </div>
      </div>
    </header>
  );
}
