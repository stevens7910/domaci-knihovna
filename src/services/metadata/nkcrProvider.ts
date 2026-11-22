import { getIsbnSearchVariants } from '../../utils/isbn';
import { cleanBookDescription } from '../../utils/text';
import { buildRequestUrl, fetchWithBookProxy } from './corsFetch';
import {
  MetadataProviderError,
  type BookMetadata,
  type MetadataProvider,
} from './MetadataProvider';

/**
 * Odstraní koncovou MARC21 interpunkci (/, :, ;, ,) a přebytečné mezery.
 */
function trimMarcPunctuation(value: string): string {
  return value.replace(/[\s/:;,]+$/, '').trim();
}

/**
 * Převede autorské jméno z MARC formátu "Příjmení, Jméno" na "Jméno Příjmení".
 */
function formatMarcAuthorName(raw: string): string {
  const cleaned = raw.replace(/,\s*$/, '').trim();
  if (!cleaned) return '';

  const commaIndex = cleaned.indexOf(',');
  if (commaIndex > 0) {
    const lastName = cleaned.slice(0, commaIndex).trim();
    const firstName = cleaned.slice(commaIndex + 1).replace(/,\s*$/, '').trim();
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
  }

  return cleaned;
}

function getElementsByLocalName(root: Document | Element, localName: string): Element[] {
  const all = root.getElementsByTagName('*');
  const matches: Element[] = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const name = el.localName || el.tagName.split(':').pop() || '';
    if (name === localName) {
      matches.push(el);
    }
  }
  return matches;
}

function getSubfieldValues(field: Element, code: string): string[] {
  const subfields = getElementsByLocalName(field, 'subfield');
  const values: string[] = [];
  for (const sf of subfields) {
    if (sf.getAttribute('code') === code) {
      const text = sf.textContent?.trim();
      if (text) values.push(text);
    }
  }
  return values;
}

/**
 * Parsuje MARCXML odpověď ze SRU rozhraní Národní knihovny ČR.
 * Vyhodí MetadataProviderError('parse_error'), pokud vstup není platný MARCXML / SRU XML dokument.
 */
export function parseNkcrMarcXml(
  xmlText: string,
  isbn13: string
): Partial<BookMetadata> | null {
  if (!xmlText || !xmlText.trim()) {
    throw new MetadataProviderError({
      outcome: 'parse_error',
      detail: 'Prázdná odpověď místo MARCXML dokumentu.',
    });
  }

  if (typeof DOMParser === 'undefined') {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parserError = doc.getElementsByTagName('parsererror');
  if (parserError.length > 0) {
    throw new MetadataProviderError({
      outcome: 'parse_error',
      detail: 'Neplatný XML formát odpovědi z NK ČR (parsererror).',
    });
  }

  const countElements = getElementsByLocalName(doc, 'numberOfRecords');
  const records = getElementsByLocalName(doc, 'record');

  if (countElements.length === 0 && records.length === 0) {
    throw new MetadataProviderError({
      outcome: 'parse_error',
      detail: 'Odpověď neobsahuje SRU ani MARCXML elementy.',
    });
  }

  if (countElements.length > 0) {
    const rawCount = countElements[0].textContent?.trim() ?? '';
    const count = Number.parseInt(rawCount, 10);
    if (Number.isNaN(count)) {
      throw new MetadataProviderError({
        outcome: 'parse_error',
        detail: 'Neplatná hodnota numberOfRecords v SRU odpovědi.',
      });
    }
    if (count === 0) {
      return null;
    }
  }

  const record = records[0];
  if (!record) {
    return null;
  }

  const datafields = getElementsByLocalName(record, 'datafield');
  if (datafields.length === 0) {
    return null;
  }

  let title: string | undefined;
  let subtitle: string | undefined;
  const authors: string[] = [];
  let publisher: string | undefined;
  let publishedYear: number | undefined;
  let pageCount: number | undefined;
  const descriptionParts: string[] = [];

  for (const field of datafields) {
    const tag = field.getAttribute('tag');
    if (!tag) continue;

    if (tag === '245') {
      const a = getSubfieldValues(field, 'a')[0];
      if (a && !title) {
        title = trimMarcPunctuation(a);
      }
      const b = getSubfieldValues(field, 'b')[0];
      if (b && !subtitle) {
        subtitle = trimMarcPunctuation(b);
      }
    } else if (tag === '100' || tag === '700') {
      const aValues = getSubfieldValues(field, 'a');
      for (const rawAuthor of aValues) {
        const formatted = formatMarcAuthorName(rawAuthor);
        if (formatted && !authors.includes(formatted)) {
          authors.push(formatted);
        }
      }
    } else if (tag === '264' || tag === '260') {
      if (!publisher) {
        const b = getSubfieldValues(field, 'b')[0];
        if (b) {
          publisher = trimMarcPunctuation(b);
        }
      }
      if (publishedYear === undefined) {
        const c = getSubfieldValues(field, 'c')[0];
        if (c) {
          const yearMatch = c.match(/\d{4}/);
          if (yearMatch) {
            const parsed = Number.parseInt(yearMatch[0], 10);
            if (parsed >= 1000 && parsed <= 2100) {
              publishedYear = parsed;
            }
          }
        }
      }
    } else if (tag === '300' && pageCount === undefined) {
      const a = getSubfieldValues(field, 'a')[0];
      if (a) {
        const pageMatch = a.match(/(\d+)\s*s/i) ?? a.match(/\d+/);
        if (pageMatch) {
          const parsed = Number.parseInt(pageMatch[1] ?? pageMatch[0], 10);
          if (parsed > 0) {
            pageCount = parsed;
          }
        }
      }
    } else if (tag === '520') {
      const aValues = getSubfieldValues(field, 'a');
      for (const rawDesc of aValues) {
        const cleaned = cleanBookDescription(rawDesc);
        if (cleaned) {
          descriptionParts.push(cleaned);
        }
      }
    }
  }

  if (!title && authors.length === 0) {
    return null;
  }

  const result: Partial<BookMetadata> = {
    isbn13,
    language: 'cs',
    source: 'nkcr',
  };

  if (title) result.title = title;
  if (subtitle) result.subtitle = subtitle;
  if (authors.length > 0) result.authors = authors;
  if (publisher) result.publisher = publisher;
  if (publishedYear !== undefined) result.publishedYear = publishedYear;
  if (pageCount !== undefined) result.pageCount = pageCount;
  if (descriptionParts.length > 0) {
    result.description = descriptionParts.join('\n\n');
  }

  return result;
}

export function buildNkcrSruQuery(isbn13: string): string {
  const variants = getIsbnSearchVariants(isbn13);
  const terms = variants ? variants.allUnique : [isbn13];
  return terms.map((variant) => `isb="${variant}"`).join(' OR ');
}

export function buildNkcrSruUrl(isbn13: string): string {
  const query = buildNkcrSruQuery(isbn13);
  return `https://aleph.nkp.cz/web/sru/skc?version=1.1&operation=searchRetrieve&query=${encodeURIComponent(query)}&recordSchema=marcxml`;
}

export class NkcrProvider implements MetadataProvider {
  readonly id = 'nkcr' as const;
  readonly displayName = 'NK ČR';
  private readonly proxyBaseUrl?: string;

  constructor(proxyBaseUrl?: string) {
    this.proxyBaseUrl = proxyBaseUrl;
  }

  getRequestUrl(isbn13: string): string {
    return buildRequestUrl({
      target: 'nkcr',
      isbn13,
      directUrl: buildNkcrSruUrl(isbn13),
      proxyBaseUrl: this.proxyBaseUrl,
    }).requestUrl;
  }

  async fetchByIsbn(
    isbn13: string,
    signal?: AbortSignal
  ): Promise<Partial<BookMetadata> | null> {
    const sruUrl = buildNkcrSruUrl(isbn13);
    const response = await fetchWithBookProxy({
      target: 'nkcr',
      isbn13,
      directUrl: sruUrl,
      signal,
      proxyBaseUrl: this.proxyBaseUrl,
    });

    const xmlText = await response.text();
    return parseNkcrMarcXml(xmlText, isbn13);
  }
}

export const nkcrProvider = new NkcrProvider();
