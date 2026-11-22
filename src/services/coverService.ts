import { getConfiguredBookProxyUrl } from './metadata/corsFetch';
import { db } from './repository/db';

const PROXY_COVER_HOSTS = new Set([
  'cache.obalkyknih.cz',
  'www.obalkyknih.cz',
  'covers.openlibrary.org',
  'books.google.com',
  'books.googleusercontent.com',
]);

const MAX_COVER_WIDTH = 400;
const MIN_VALID_IMAGE_BYTES = 500;
const inflightDownloads = new Map<string, Promise<boolean>>();

/**
 * Vrátí proxy URL (/api/proxy?url=...) pro podporované knižní domény obálek,
 * aby obálky fungovaly bez CORS/Referer problémů a šly uložit do IndexedDB.
 */
export function buildProxiedCoverUrl(coverUrl: string): string {
  const normalizedUrl = coverUrl.trim().replace(/^http:\/\//i, 'https://');
  try {
    const parsed = new URL(normalizedUrl);
    if (parsed.protocol === 'https:' && PROXY_COVER_HOSTS.has(parsed.hostname)) {
      const proxyBase = getConfiguredBookProxyUrl().replace(/\/+$/, '');
      const sep = proxyBase.includes('?') ? '&' : '?';
      return `${proxyBase}${sep}url=${encodeURIComponent(normalizedUrl)}`;
    }
  } catch {
    // Pokud není platná absolutní URL, vrátíme původní hodnotu
  }
  return normalizedUrl;
}

/**
 * Zoptimalizuje stažený obrázek obálky na max šířku 400 px (WebP nebo JPEG, kvalita 0.85),
 * aby IndexedDB na mobilu zbytečně nenabobtnala.
 */
async function optimizeCoverBlob(inputBlob: Blob): Promise<Blob> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return inputBlob;
  }

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(inputBlob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image decode failed'));
      image.src = objectUrl!;
    });

    const srcWidth = img.naturalWidth || img.width;
    const srcHeight = img.naturalHeight || img.height;
    if (!srcWidth || !srcHeight) {
      return inputBlob;
    }

    const scale = srcWidth > MAX_COVER_WIDTH ? MAX_COVER_WIDTH / srcWidth : 1;
    const targetWidth = Math.max(1, Math.round(srcWidth * scale));
    const targetHeight = Math.max(1, Math.round(srcHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return inputBlob;
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const toBlobWithType = (mime: string): Promise<Blob | null> =>
      new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), mime, 0.85);
      });

    const webpBlob = await toBlobWithType('image/webp');
    if (webpBlob && webpBlob.size > MIN_VALID_IMAGE_BYTES) {
      return webpBlob;
    }

    const jpegBlob = await toBlobWithType('image/jpeg');
    if (jpegBlob && jpegBlob.size > MIN_VALID_IMAGE_BYTES) {
      return jpegBlob;
    }

    return inputBlob;
  } catch {
    return inputBlob;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

async function fetchImageBlob(url: string): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    if (
      !blob ||
      blob.size <= MIN_VALID_IMAGE_BYTES ||
      !blob.type.startsWith('image/')
    ) {
      return null;
    }

    return blob;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stáhne obrázek obálky přes /api/proxy (s přímým fetch fallbackem), zoptimalizuje jej
 * a uloží jako Blob do IndexedDB pod bookId. Nikdy nevyhodí neošetřenou chybu.
 */
export async function downloadAndStoreCover(
  bookId: string,
  coverUrl?: string
): Promise<boolean> {
  if (!bookId || !coverUrl || !coverUrl.trim()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  const existing = inflightDownloads.get(bookId);
  if (existing) {
    return existing;
  }

  const task = (async (): Promise<boolean> => {
    try {
      const normalizedDirect = coverUrl.trim().replace(/^http:\/\//i, 'https://');
      const proxiedUrl = buildProxiedCoverUrl(normalizedDirect);

      let rawBlob = await fetchImageBlob(proxiedUrl);
      if (!rawBlob && proxiedUrl !== normalizedDirect) {
        rawBlob = await fetchImageBlob(normalizedDirect);
      }

      if (!rawBlob) {
        return false;
      }

      const optimized = await optimizeCoverBlob(rawBlob);

      await db.covers.put({
        bookId,
        blob: optimized,
        mimeType: optimized.type || rawBlob.type || 'image/jpeg',
        updatedAt: new Date().toISOString(),
      });

      return true;
    } catch {
      return false;
    } finally {
      inflightDownloads.delete(bookId);
    }
  })();

  inflightDownloads.set(bookId, task);
  return task;
}

/**
 * Načte lokálně uložený Blob obálky z IndexedDB podle bookId.
 */
export async function getLocalCoverBlob(bookId: string): Promise<Blob | null> {
  if (!bookId) return null;
  try {
    const entry = await db.covers.get(bookId);
    return entry?.blob ?? null;
  } catch {
    return null;
  }
}

/**
 * Smaže lokální obálku knihy z IndexedDB.
 */
export async function deleteLocalCover(bookId: string): Promise<void> {
  if (!bookId) return;
  try {
    await db.covers.delete(bookId);
  } catch {
    // Ignorovat chyby v prostředí bez IndexedDB
  }
}

/**
 * Na pozadí dotáhne chybějící lokální obálky (např. po importu JSON zálohy na nové zařízení).
 */
export async function backfillMissingCovers(
  books: Array<{ id: string; coverUrl?: string }>
): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }

  const candidates = books.filter((b) => Boolean(b.coverUrl?.trim()));
  const batchSize = 3;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const slice = candidates.slice(i, i + batchSize);
    await Promise.all(
      slice.map(async (book) => {
        const existing = await getLocalCoverBlob(book.id);
        if (!existing && book.coverUrl) {
          await downloadAndStoreCover(book.id, book.coverUrl);
        }
      })
    );
  }
}
