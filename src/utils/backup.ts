import type { Book, BookSource, LibraryBackup, ReadingStatus } from '../types';
import { normalizeIsbn } from './isbn';

const VALID_STATUSES: ReadingStatus[] = ['unread', 'reading', 'read', 'lent'];
const VALID_SOURCES: BookSource[] = ['manual', 'openlibrary', 'googlebooks', 'nkcr'];

export function createBackupPayload(books: Book[]): LibraryBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    books,
  };
}

export function downloadBackupJson(books: Book[]): string {
  const payload = createBackupPayload(books);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `domaci-knihovna-zaloha-${dateStr}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return filename;
}

export interface ParsedBackupResult {
  valid: true;
  books: Book[];
  skippedCount: number;
}

export interface ParsedBackupError {
  valid: false;
  error: string;
}

export function parseBackupJson(rawText: string): ParsedBackupResult | ParsedBackupError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      valid: false,
      error: 'Soubor není platný JSON. Zkontrolujte prosím vybraný soubor.',
    };
  }

  let rawBooks: unknown[];
  if (Array.isArray(parsed)) {
    rawBooks = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    'books' in parsed &&
    Array.isArray((parsed as { books: unknown }).books)
  ) {
    rawBooks = (parsed as { books: unknown[] }).books;
  } else {
    return {
      valid: false,
      error: 'Soubor nemá očekávaný formát zálohy Domácí knihovny (chybí pole "books").',
    };
  }

  const now = new Date().toISOString();
  const validBooks: Book[] = [];
  let skippedCount = 0;

  for (const item of rawBooks) {
    if (!item || typeof item !== 'object') {
      skippedCount++;
      continue;
    }

    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const rawIsbn =
      typeof record.isbn13 === 'string'
        ? record.isbn13
        : typeof record.isbn10 === 'string'
          ? record.isbn10
          : '';
    const normalized = normalizeIsbn(rawIsbn);

    const authors = Array.isArray(record.authors)
      ? record.authors
          .filter((a): a is string => typeof a === 'string')
          .map((a) => a.trim())
          .filter(Boolean)
      : [];

    if (!title || !normalized.valid || authors.length === 0) {
      skippedCount++;
      continue;
    }

    const readingStatus: ReadingStatus = VALID_STATUSES.includes(
      record.readingStatus as ReadingStatus
    )
      ? (record.readingStatus as ReadingStatus)
      : 'unread';

    const source: BookSource = VALID_SOURCES.includes(record.source as BookSource)
      ? (record.source as BookSource)
      : 'manual';

    const id =
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id.trim()
        : generateUuid();

    validBooks.push({
      id,
      isbn13: normalized.isbn13,
      isbn10:
        typeof record.isbn10 === 'string' && record.isbn10.trim()
          ? record.isbn10.trim()
          : normalized.isbn10,
      title,
      subtitle: typeof record.subtitle === 'string' && record.subtitle.trim() ? record.subtitle.trim() : undefined,
      authors,
      publisher: typeof record.publisher === 'string' && record.publisher.trim() ? record.publisher.trim() : undefined,
      publishedYear: typeof record.publishedYear === 'number' && Number.isFinite(record.publishedYear) ? record.publishedYear : undefined,
      pageCount: typeof record.pageCount === 'number' && Number.isFinite(record.pageCount) ? record.pageCount : undefined,
      language: typeof record.language === 'string' && record.language.trim() ? record.language.trim() : 'cs',
      coverUrl: typeof record.coverUrl === 'string' && record.coverUrl.trim() ? record.coverUrl.trim() : undefined,
      location: typeof record.location === 'string' && record.location.trim() ? record.location.trim() : undefined,
      shelfTag: typeof record.shelfTag === 'string' && record.shelfTag.trim() ? record.shelfTag.trim() : undefined,
      readingStatus,
      lentTo:
        readingStatus === 'lent' && typeof record.lentTo === 'string' && record.lentTo.trim()
          ? record.lentTo.trim()
          : undefined,
      description:
        typeof record.description === 'string' && record.description.trim()
          ? record.description.trim()
          : undefined,
      notes: typeof record.notes === 'string' && record.notes.trim() ? record.notes.trim() : undefined,
      source,
      createdAt: typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : now,
      updatedAt: typeof record.updatedAt === 'string' && record.updatedAt ? record.updatedAt : now,
    });
  }

  return {
    valid: true,
    books: validBooks,
    skippedCount,
  };
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
