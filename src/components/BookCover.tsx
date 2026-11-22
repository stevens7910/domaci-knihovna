import { Book as BookIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  cacheBookCover,
  getCachedCoverBlob,
} from '../services/covers/coverCacheService';

interface BookCoverProps {
  isbn13: string;
  title: string;
  authors?: string[];
  coverUrl?: string;
  className?: string;
}

const COVER_PALETTES = [
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-stone-200 text-stone-800 border-stone-300',
  'bg-emerald-100 text-emerald-900 border-emerald-200',
  'bg-sky-100 text-sky-900 border-sky-200',
  'bg-rose-100 text-rose-900 border-rose-200',
  'bg-indigo-100 text-indigo-900 border-indigo-200',
];

function getPaletteForBook(isbn13: string): string {
  let hash = 0;
  for (let i = 0; i < isbn13.length; i++) {
    hash = (hash * 31 + isbn13.charCodeAt(i)) % COVER_PALETTES.length;
  }
  return COVER_PALETTES[Math.abs(hash) % COVER_PALETTES.length];
}

export function BookCover({
  isbn13,
  title,
  authors,
  coverUrl,
  className = 'h-28 w-20',
}: BookCoverProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [remoteFailed, setRemoteFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    setRemoteFailed(false);

    void (async () => {
      const localBlob = await getCachedCoverBlob(isbn13);
      if (!active) return;

      if (localBlob) {
        createdUrl = URL.createObjectURL(localBlob);
        setObjectUrl(createdUrl);
        return;
      }

      setObjectUrl(null);

      // Pokud lokálně není a máme URL + jsme online, stáhneme na pozadí pro příští offline použití
      if (coverUrl && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        const cached = await cacheBookCover(isbn13, coverUrl);
        if (cached && active) {
          const freshBlob = await getCachedCoverBlob(isbn13);
          if (freshBlob && active) {
            createdUrl = URL.createObjectURL(freshBlob);
            setObjectUrl(createdUrl);
          }
        }
      }
    })();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [isbn13, coverUrl]);

  const src = objectUrl || (!remoteFailed && coverUrl ? coverUrl : null);

  if (src) {
    return (
      <img
        src={src}
        alt={`Obálka knihy ${title}`}
        onError={() => {
          if (objectUrl) {
            setObjectUrl(null);
          } else {
            setRemoteFailed(true);
          }
        }}
        className={`${className} shrink-0 rounded-xl border border-stone-200 object-cover shadow-xs`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={`${className} flex shrink-0 flex-col items-center justify-center rounded-xl border p-2 text-center ${getPaletteForBook(isbn13)}`}
    >
      <BookIcon className="h-6 w-6 opacity-70" />
      <span className="mt-1.5 line-clamp-2 text-[10px] font-semibold leading-tight opacity-85">
        {title.slice(0, 22)}
      </span>
      {authors && authors.length > 0 && (
        <span className="mt-0.5 line-clamp-1 text-[9px] opacity-65">
          {authors[0]}
        </span>
      )}
    </div>
  );
}
