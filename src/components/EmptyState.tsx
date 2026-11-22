import { BookPlus, Library, SearchX } from 'lucide-react';

interface EmptyStateProps {
  hasBooks: boolean;
  onAddBook: () => void;
  onResetFilters: () => void;
}

export function EmptyState({ hasBooks, onAddBook, onResetFilters }: EmptyStateProps) {
  if (!hasBooks) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300 bg-white/70 px-6 py-14 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-800">
          <Library className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold text-stone-900">
          Vaše knihovna je zatím prázdná
        </h2>
        <p className="mt-1.5 max-w-sm text-sm text-stone-500">
          Přidejte první knihu podle ISBN. Všechna data se ukládají lokálně do vašeho zařízení a fungují i bez připojení k internetu.
        </p>
        <button
          type="button"
          onClick={onAddBook}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-amber-900 active:scale-[0.98]"
        >
          <BookPlus className="h-4 w-4" />
          <span>Přidat první knihu</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-stone-200 bg-white px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
        <SearchX className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-stone-900">
        Žádné knihy neodpovídají filtru
      </h2>
      <p className="mt-1 max-w-sm text-sm text-stone-500">
        Zkuste upravit hledaný výraz nebo přepnout filtr stavu přečtení.
      </p>
      <button
        type="button"
        onClick={onResetFilters}
        className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
      >
        Zobrazit všechny knihy
      </button>
    </div>
  );
}
