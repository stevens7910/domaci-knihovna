import type { BookSource } from '../../types';

/**
 * Struktura knižních metadat získaných z externích databází.
 */
export interface BookMetadata {
  isbn13: string;
  isbn10?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publishedYear?: number;
  pageCount?: number;
  language?: string;
  coverUrl?: string;
  description?: string;
  source: Exclude<BookSource, 'manual'>;
}

export type ProviderOutcome =
  | 'ok'
  | 'empty'
  | 'cors_or_network'
  | 'http_error'
  | 'parse_error'
  | 'timeout';

export interface ProviderAttemptDiagnostic {
  providerId: Exclude<BookSource, 'manual'>;
  provider: string;
  outcome: ProviderOutcome;
  httpStatus?: number;
  requestUrl?: string;
  detail: string;
  durationMs?: number;
}

export class MetadataProviderError extends Error {
  readonly outcome: Exclude<ProviderOutcome, 'ok' | 'empty'>;
  readonly httpStatus?: number;
  readonly requestUrl?: string;
  readonly detail: string;

  constructor(options: {
    outcome: Exclude<ProviderOutcome, 'ok' | 'empty'>;
    detail: string;
    httpStatus?: number;
    requestUrl?: string;
  }) {
    super(options.detail);
    this.name = 'MetadataProviderError';
    this.outcome = options.outcome;
    this.httpStatus = options.httpStatus;
    this.requestUrl = options.requestUrl;
    this.detail = options.detail;
  }
}

/**
 * Společné rozhraní pro poskytovatele knižních metadat (NK ČR, Obálky knih, Google Books, Open Library).
 */
export interface MetadataProvider {
  readonly id: Exclude<BookSource, 'manual'>;
  readonly displayName: string;
  isEnabled?(): boolean;
  getRequestUrl?(isbn13: string): string;
  fetchByIsbn(isbn13: string, signal?: AbortSignal): Promise<Partial<BookMetadata> | null>;
}
