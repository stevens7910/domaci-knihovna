import { Book as BookIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  buildProxiedCoverUrl,
  downloadAndStoreCover,
  getLocalCoverBlob,
} from '../services/coverService';

interface BookCoverProps {
  bookId?: string;
  isbn13?: string;
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

function getPaletteForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % COVER_PALETTES.length;
  }
  return COVER_PALETTES[Math.abs(hash) % COVER_PALETTES.length];
}

function getTitleInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'BK';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

export function BookCover({
  bookId,
  isbn13,
  title,
  authors,
  coverUrl,
  className = 'h-28 w-20',
}: BookCoverProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [proxyFailed, setProxyFailed] = useState(false);
  const [directFailed, setDirectFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    setProxyFailed(false);
    setDirectFailed(false);

    if (!bookId) {
      setObjectUrl(null);
      return;
    }

    void (async () => {
      const localBlob = await getLocalCoverBlob(bookId);
      if (!active) return;

      if (localBlob) {
        createdUrl = URL.createObjectURL(localBlob);
        setObjectUrl(createdUrl);
        return;
      }

      setObjectUrl(null);

      // Pokud lokální Blob ještě neexistuje a jsme online, stáhneme a uložíme jej na pozadí
      if (
        coverUrl &&
        coverUrl.trim() &&
        (typeof navigator === 'undefined' || navigator.onLine !== false)
      ) {
        const stored = await downloadAndStoreCover(bookId, coverUrl);
        if (stored && active) {
          const freshBlob = await getLocalCoverBlob(bookId);
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
  }, [bookId, coverUrl]);

  const cleanCoverUrl = coverUrl?.trim();
  const proxiedUrl = cleanCoverUrl ? buildProxiedCoverUrl(cleanCoverUrl) : null;

  let activeSrc: string | null = null;
  if (objectUrl) {
    activeSrc = objectUrl;
  } else if (proxiedUrl && !proxyFailed) {
    activeSrc = proxiedUrl;
  } else if (cleanCoverUrl && proxiedUrl !== cleanCoverUrl && !directFailed) {
    activeSrc = cleanCoverUrl;
  }

  if (activeSrc) {
    return (
      <img
        src={activeSrc}
        alt={`Obálka knihy ${title || 'bez názvu'}`}
        onError={() => {
          if (objectUrl) {
            setObjectUrl(null);
          } else if (!proxyFailed) {
            setProxyFailed(true);
          } else {
            setDirectFailed(true);
          }
        }}
        className={`${className} shrink-0 rounded-xl border border-stone-200 object-cover shadow-xs`}
        loading="lazy"
      />
    );
  }

  const seed = isbn13 || bookId || title || 'book';

  return (
    <div
      className={`${className} flex shrink-0 flex-col items-center justify-center rounded-xl border p-2 text-center ${getPaletteForSeed(seed)}`}
    >
      <BookIcon className="h-5 w-5 opacity-65" />
      <span className="mt-1 text-xs font-bold tracking-wider opacity-85">
        {getTitleInitials(title)}
      </span>
      <span className="mt-0.5 line-clamp-2 text-[9px] font-medium leading-tight opacity-80">
        {(title || 'Bez názvu').slice(0, 24)}
      </span>
      {authors && authors.length > 0 && (
        <span className="mt-0.5 line-clamp-1 text-[8px] opacity-65">
          {authors[0]}
        </span>
      )}
    </div>
  );
}
