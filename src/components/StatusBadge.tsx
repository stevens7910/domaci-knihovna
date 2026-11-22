import { BookOpen, CheckCircle2, CircleDashed, HandHelping } from 'lucide-react';
import { READING_STATUS_LABELS, type ReadingStatus } from '../types';

interface StatusBadgeProps {
  status: ReadingStatus;
  lentTo?: string;
  size?: 'sm' | 'md';
}

const STATUS_STYLES: Record<ReadingStatus, string> = {
  unread: 'bg-stone-100 text-stone-700 ring-stone-200',
  reading: 'bg-amber-50 text-amber-800 ring-amber-200',
  read: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  lent: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
};

const STATUS_ICONS: Record<ReadingStatus, typeof BookOpen> = {
  unread: CircleDashed,
  reading: BookOpen,
  read: CheckCircle2,
  lent: HandHelping,
};

export function StatusBadge({ status, lentTo, size = 'sm' }: StatusBadgeProps) {
  const Icon = STATUS_ICONS[status];
  const label =
    status === 'lent' && lentTo
      ? `Půjčeno: ${lentTo}`
      : READING_STATUS_LABELS[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset ${STATUS_STYLES[status]} ${
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4 shrink-0'} />
      <span className="truncate max-w-[180px]">{label}</span>
    </span>
  );
}
