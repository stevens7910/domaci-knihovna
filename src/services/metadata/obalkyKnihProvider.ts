import { cleanBookDescription } from '../../utils/text';
import { fetchWithCorsFallback } from './corsFetch';
import { sanitizeHttpsUrl } from './googleBooksProvider';
import type { BookMetadata, MetadataProvider } from './MetadataProvider';

interface ObalkyKnihApiEntry {
  cover_preview510_url?: string;
  cover_medium_url?: string;
  cover_thumbnail_url?: string;
  bib_title?: string;
  bib_author?: string;
  bib_year?: string;
  annotation?: {
    html?: string;
    source?: string;
  };
}

export class ObalkyKnihProvider implements MetadataProvider {
  readonly id = 'obalkyknih' as const;
  readonly displayName = 'Obálky knih';

  async fetchByIsbn(
    isbn13: string,
    signal?: AbortSignal
  ): Promise<Partial<BookMetadata> | null> {
    const multiParam = encodeURIComponent(JSON.stringify([{ isbn: isbn13 }]));
    const apiUrl = `https://cache.obalkyknih.cz/api/books?multi=${multiParam}`;
    const response = await fetchWithCorsFallback(apiUrl, signal);

    if (!response.ok) {
      throw new Error(`Obálky knih API vrátilo HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ObalkyKnihApiEntry[] | unknown;
    if (!Array.isArray(payload) || payload.length === 0) {
      return null;
    }

    const entry = payload[0] as ObalkyKnihApiEntry | undefined;
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const coverUrl = sanitizeHttpsUrl(
      entry.cover_preview510_url ||
        entry.cover_medium_url ||
        entry.cover_thumbnail_url
    );

    const description = entry.annotation?.html
      ? cleanBookDescription(entry.annotation.html)
      : '';

    const title = entry.bib_title?.trim();

    let authors: string[] | undefined;
    if (entry.bib_author && entry.bib_author.trim()) {
      const rawAuthor = entry.bib_author.trim().replace(/,\s*$/, '');
      if (rawAuthor) {
        authors = [rawAuthor];
      }
    }

    let publishedYear: number | undefined;
    if (entry.bib_year) {
      const match = String(entry.bib_year).match(/\d{4}/);
      if (match) {
        const parsed = Number.parseInt(match[0], 10);
        if (parsed >= 1000 && parsed <= 2100) {
          publishedYear = parsed;
        }
      }
    }

    if (!coverUrl && !description && !title && (!authors || authors.length === 0)) {
      return null;
    }

    const result: Partial<BookMetadata> = {
      isbn13,
      language: 'cs',
      source: 'obalkyknih',
    };

    if (title) result.title = title;
    if (authors && authors.length > 0) result.authors = authors;
    if (publishedYear !== undefined) result.publishedYear = publishedYear;
    if (coverUrl) result.coverUrl = coverUrl;
    if (description) result.description = description;

    return result;
  }
}

export const obalkyKnihProvider = new ObalkyKnihProvider();
