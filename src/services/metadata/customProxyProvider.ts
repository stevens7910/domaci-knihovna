import { cleanBookDescription } from '../../utils/text';
import { parsePublishedYear, sanitizeHttpsUrl } from './googleBooksProvider';
import type { BookMetadata, MetadataProvider } from './MetadataProvider';

export const CUSTOM_PROXY_STORAGE_KEY = 'domaci_knihovna_proxy_url';

/**
 * Volitelný provider pro české knižní zdroje (např. NK ČR / Obálky knih) přes vlastní CORS proxy.
 * Aktivuje se pouze tehdy, pokud je nastavena URL v env proměnné VITE_CUSTOM_METADATA_PROXY_URL
 * nebo v localStorage pod klíčem "domaci_knihovna_proxy_url".
 */
export class CustomProxyProvider implements MetadataProvider {
  readonly id = 'nkcr' as const;
  readonly displayName = 'NK ČR (Proxy)';
  private readonly explicitEndpoint?: string;

  constructor(endpointUrl?: string) {
    this.explicitEndpoint = endpointUrl;
  }

  getEndpointUrl(): string | undefined {
    if (this.explicitEndpoint && this.explicitEndpoint.trim()) {
      return this.explicitEndpoint.trim();
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(CUSTOM_PROXY_STORAGE_KEY);
        if (stored && stored.trim()) {
          return stored.trim();
        }
      }
    } catch {
      // Ignorovat chyby přístupu k localStorage
    }

    const envUrl = import.meta.env?.VITE_CUSTOM_METADATA_PROXY_URL as
      | string
      | undefined;
    if (envUrl && envUrl.trim()) {
      return envUrl.trim();
    }

    return undefined;
  }

  isEnabled(): boolean {
    return Boolean(this.getEndpointUrl());
  }

  async fetchByIsbn(
    isbn13: string,
    signal?: AbortSignal
  ): Promise<Partial<BookMetadata> | null> {
    const endpoint = this.getEndpointUrl();
    if (!endpoint) {
      return null;
    }

    const requestUrl = endpoint.includes('{isbn}')
      ? endpoint.replace('{isbn}', encodeURIComponent(isbn13))
      : `${endpoint}${endpoint.includes('?') ? '&' : '?'}isbn=${encodeURIComponent(isbn13)}`;

    const response = await fetch(requestUrl, { signal });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Custom Proxy API vrátilo HTTP ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') {
      return null;
    }

    const title = typeof data.title === 'string' ? data.title.trim() : undefined;
    const subtitle =
      typeof data.subtitle === 'string' ? data.subtitle.trim() : undefined;
    const authors = Array.isArray(data.authors)
      ? data.authors
          .filter((a): a is string => typeof a === 'string')
          .map((a) => a.trim())
          .filter(Boolean)
      : undefined;
    const publisher =
      typeof data.publisher === 'string' ? data.publisher.trim() : undefined;
    const publishedYear =
      typeof data.publishedYear === 'number' && Number.isFinite(data.publishedYear)
        ? data.publishedYear
        : typeof data.publishedDate === 'string'
          ? parsePublishedYear(data.publishedDate)
          : undefined;
    const pageCount =
      typeof data.pageCount === 'number' && data.pageCount > 0
        ? data.pageCount
        : undefined;
    const language =
      typeof data.language === 'string' && data.language.trim()
        ? data.language.trim().toLowerCase()
        : undefined;
    const coverUrl = sanitizeHttpsUrl(
      typeof data.coverUrl === 'string' ? data.coverUrl : undefined
    );
    const description =
      typeof data.description === 'string'
        ? cleanBookDescription(data.description)
        : '';

    if (!title && (!authors || authors.length === 0) && !coverUrl && !description) {
      return null;
    }

    const result: Partial<BookMetadata> = {
      isbn13,
      source: 'nkcr',
    };

    if (title) result.title = title;
    if (subtitle) result.subtitle = subtitle;
    if (authors && authors.length > 0) result.authors = authors;
    if (publisher) result.publisher = publisher;
    if (publishedYear !== undefined) result.publishedYear = publishedYear;
    if (pageCount !== undefined) result.pageCount = pageCount;
    if (language) result.language = language;
    if (coverUrl) result.coverUrl = coverUrl;
    if (description) result.description = description;

    return result;
  }
}

export const customProxyProvider = new CustomProxyProvider();
