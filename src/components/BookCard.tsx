import { Check, MapPin, Tag } from 'lucide-react';
import type { Book, UpdateBookInput } from '../types';
import { formatIsbn13 } from '../utils/isbn';
import { BookCover } from './BookCover';
import { StatusBadge } from './StatusBadge';

interface BookCardProps {
  book: Book;
  onSelect: (book: Book) => void;
  onQuickUpdate?: (id: string, patch: UpdateBookInput) => Promise<void>;
}

export function BookCard({ book, onSelect, onQuickUpdate }: BookCardProps) {
  return (
    <article
      onClick={() => onSelect(book)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(book);
        }
      }}
      role="button"
      tabIndex={0}
      className="group flex cursor-pointer gap-3.5 rounded-2xl border border-stone-200/90 bg-white p-3.5 shadow-xs transition hover:border-amber-700/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-700/30 active:scale-[0.995]"
    >
      {/* Lokálně kešovaná obálka s fallbackem na proxy URL a placeholder */}
      <BookCover
        bookId={book.id}
        isbn13={book.isbn13}
        title={book.title}
        authors={book.authors}
        coverUrl={book.coverUrl}
        className="h-28 w-20"
      />

      {/* Obsah karty */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-base font-semibold leading-snug text-stone-900 group-hover:text-amber-900">
              {book.title}
            </h3>
          </div>

          {book.subtitle && (
            <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">
              {book.subtitle}
            </p>
          )}

          <p className="mt-1 line-clamp-1 text-sm font-medium text-stone-600">
            {book.authors.join(', ')}
          </p>

          <p className="mt-1 font-mono text-xs text-stone-400">
            ISBN {formatIsbn13(book.isbn13)}
          </p>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={book.readingStatus} lentTo={book.lentTo} />

          {book.readingStatus === 'lent' && onQuickUpdate && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onQuickUpdate(book.id, {
                  readingStatus: 'read',
                  lentTo: undefined,
                });
              }}
              title="Označit knihu jako vrácenou"
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50"
            >
              <Check className="h-3 w-3" />
              <span>Vráceno</span>
            </button>
          )}

          {book.location && (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
              <MapPin className="h-3 w-3 shrink-0 text-stone-400" />
              <span className="truncate max-w-[140px]">{book.location}</span>
            </span>
          )}

          {book.shelfTag && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50/70 px-2 py-0.5 text-xs text-amber-900/80">
              <Tag className="h-3 w-3 shrink-0 text-amber-700/60" />
              <span className="truncate max-w-[100px]">{book.shelfTag}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
