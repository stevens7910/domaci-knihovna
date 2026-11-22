import { db } from '../repository/db';

const inflightFetches = new Map<string, Promise<boolean>>();

/**
 * Stáhne obrázek obálky ze sítě a uloží jej jako Blob do IndexedDB (tabulka covers).
 * Pokud je zařízení offline nebo stažení selže (např. CORS / 404), tiše vrátí false.
 */
export async function cacheBookCover(
  isbn13: string,
  coverUrl?: string
): Promise<boolean> {
  if (!isbn13 || !coverUrl) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  const existingPromise = inflightFetches.get(isbn13);
  if (existingPromise) {
    return existingPromise;
  }

  const task = (async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);

      try {
        const response = await fetch(coverUrl, {
          signal: controller.signal,
          mode: 'cors',
        });

        if (!response.ok) {
          return false;
        }

        const blob = await response.blob();
        if (!blob || blob.size === 0 || !blob.type.startsWith('image/')) {
          return false;
        }

        await db.covers.put({
          isbn13,
          blob,
          mimeType: blob.type || 'image/jpeg',
          savedAt: Date.now(),
        });

        return true;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    } finally {
      inflightFetches.delete(isbn13);
    }
  })();

  inflightFetches.set(isbn13, task);
  return task;
}

/**
 * Vrátí lokálně uložený Blob obálky z IndexedDB, pokud existuje.
 */
export async function getCachedCoverBlob(isbn13: string): Promise<Blob | null> {
  if (!isbn13) return null;
  try {
    const entry = await db.covers.get(isbn13);
    return entry?.blob ?? null;
  } catch {
    return null;
  }
}

/**
 * Smaže lokálně uloženou obálku z IndexedDB, pokud na stejné ISBN-13 už neodkazuje žádná jiná kniha.
 */
export async function deleteCoverIfUnused(isbn13: string): Promise<void> {
  if (!isbn13) return;
  try {
    const remainingCount = await db.books.where('isbn13').equals(isbn13).count();
    if (remainingCount === 0) {
      await db.covers.delete(isbn13);
    }
  } catch {
    // Ignorovat chyby v prostředí bez IndexedDB
  }
}
