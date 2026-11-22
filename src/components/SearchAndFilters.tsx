import { MapPin, Search, Tag, X } from 'lucide-react';
import { READING_STATUS_LABELS, type ReadingStatus, type StatusFilter } from '../types';

interface SearchAndFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
  locationFilter: string;
  onLocationFilterChange: (location: string) => void;
  tagFilter: string;
  onTagFilterChange: (tag: string) => void;
  existingLocations: string[];
  existingTags: string[];
  counts: Record<StatusFilter, number>;
}

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Vše' },
  { value: 'unread', label: READING_STATUS_LABELS.unread },
  { value: 'reading', label: READING_STATUS_LABELS.reading },
  { value: 'read', label: READING_STATUS_LABELS.read },
  { value: 'lent', label: READING_STATUS_LABELS.lent },
];

export function SearchAndFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  locationFilter,
  onLocationFilterChange,
  tagFilter,
  onTagFilterChange,
  existingLocations,
  existingTags,
  counts,
}: SearchAndFiltersProps) {
  const hasExtraFilters = existingLocations.length > 0 || existingTags.length > 0;

  return (
    <section className="space-y-3" aria-label="Vyhledávání a filtry">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Hledat podle názvu, autora, ISBN, umístění nebo půjčení…"
          aria-label="Hledat v knihovně"
          className="w-full rounded-2xl border border-stone-200 bg-white py-3 pl-10 pr-10 text-sm text-stone-900 shadow-xs placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/15"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Vymazat vyhledávání"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
        {FILTER_OPTIONS.map((opt) => {
          const active = statusFilter === opt.value;
          const count = counts[opt.value as ReadingStatus | 'all'];

          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStatusFilterChange(opt.value)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900'
              }`}
            >
              <span>{opt.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-xs ${
                  active ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {hasExtraFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {existingLocations.length > 0 && (
            <div className="relative flex-1 min-w-[170px] sm:flex-initial">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
              <select
                value={locationFilter}
                onChange={(e) => onLocationFilterChange(e.target.value)}
                aria-label="Filtrovat podle umístění"
                className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-8 pr-7 text-xs font-medium text-stone-700 shadow-2xs focus:border-amber-700 focus:outline-none"
              >
                <option value="">Všechna umístění</option>
                {existingLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          )}

          {existingTags.length > 0 && (
            <div className="relative flex-1 min-w-[150px] sm:flex-initial">
              <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
              <select
                value={tagFilter}
                onChange={(e) => onTagFilterChange(e.target.value)}
                aria-label="Filtrovat podle štítku"
                className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-8 pr-7 text-xs font-medium text-stone-700 shadow-2xs focus:border-amber-700 focus:outline-none"
              >
                <option value="">Všechny štítky</option>
                {existingTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(locationFilter || tagFilter) && (
            <button
              type="button"
              onClick={() => {
                onLocationFilterChange('');
                onTagFilterChange('');
              }}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-600 transition hover:bg-stone-100"
            >
              Zrušit filtry police
            </button>
          )}
        </div>
      )}
    </section>
  );
}
