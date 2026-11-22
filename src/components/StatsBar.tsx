import { BookCheck, BookOpen, CircleDashed, HandHelping, Library } from 'lucide-react';
import type { StatusFilter } from '../types';

interface StatsBarProps {
  counts: Record<StatusFilter, number>;
  activeFilter: StatusFilter;
  onSelectFilter: (filter: StatusFilter) => void;
}

export function StatsBar({
  counts,
  activeFilter,
  onSelectFilter,
}: StatsBarProps) {
  const items: Array<{
    key: StatusFilter;
    label: string;
    value: number;
    icon: typeof Library;
    accent: string;
    activeRing: string;
  }> = [
    {
      key: 'all',
      label: 'Celkem knih',
      value: counts.all,
      icon: Library,
      accent: 'bg-stone-100 text-stone-700',
      activeRing: 'border-stone-900 bg-stone-900 text-white',
    },
    {
      key: 'read',
      label: 'Přečteno',
      value: counts.read,
      icon: BookCheck,
      accent: 'bg-emerald-50 text-emerald-700',
      activeRing: 'border-emerald-700 bg-emerald-50/70 text-emerald-950',
    },
    {
      key: 'unread',
      label: 'Nepřečteno',
      value: counts.unread,
      icon: CircleDashed,
      accent: 'bg-amber-50 text-amber-800',
      activeRing: 'border-amber-700 bg-amber-50/70 text-amber-950',
    },
    {
      key: 'reading',
      label: 'Rozečteno',
      value: counts.reading,
      icon: BookOpen,
      accent: 'bg-sky-50 text-sky-700',
      activeRing: 'border-sky-700 bg-sky-50/70 text-sky-950',
    },
    {
      key: 'lent',
      label: 'Půjčeno',
      value: counts.lent,
      icon: HandHelping,
      accent: 'bg-indigo-50 text-indigo-700',
      activeRing: 'border-indigo-700 bg-indigo-50/80 text-indigo-950',
    },
  ];

  return (
    <section
      aria-label="Statistiky knihovny"
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-5"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeFilter === item.key;
        const isDarkActive = isActive && item.key === 'all';

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelectFilter(item.key)}
            className={`flex items-center gap-2.5 rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
              isActive
                ? `${item.activeRing} shadow-xs`
                : 'border-stone-200/90 bg-white hover:border-stone-300'
            }`}
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                isDarkActive ? 'bg-white/15 text-white' : item.accent
              }`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p
                className={`text-lg font-bold leading-none ${
                  isDarkActive ? 'text-white' : 'text-stone-900'
                }`}
              >
                {item.value}
              </p>
              <p
                className={`mt-1 truncate text-[11px] font-medium ${
                  isDarkActive ? 'text-stone-300' : 'text-stone-500'
                }`}
              >
                {item.label}
              </p>
            </div>
          </button>
        );
      })}
    </section>
  );
}
