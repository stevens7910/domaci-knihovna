import ISBN from 'isbn3';

export interface NormalizedIsbnSuccess {
  valid: true;
  isbn13: string;
  isbn10?: string;
  originalType: 'isbn10' | 'isbn13';
}

export interface NormalizedIsbnFailure {
  valid: false;
  error: string;
}

export type NormalizedIsbnResult = NormalizedIsbnSuccess | NormalizedIsbnFailure;

export interface IsbnSearchVariants {
  isbn13: string;
  isbn13Hyphenated: string;
  isbn10?: string;
  isbn10Hyphenated?: string;
  allUnique: string[];
}

/**
 * Odstraní mezery, pomlčky, volitelný prefix "ISBN" a převede písmena na velká (kvůli kontrolnímu znaku 'X').
 * Pokud vstup obsahuje 18 číslic začínajících 978 nebo 979 (EAN-13 + 5místný cenový doplněk EAN-5),
 * automaticky ořízne posledních 5 číslic a vrátí prvních 13.
 */
export function cleanIsbn(input: string): string {
  const cleaned = input
    .trim()
    .replace(/^isbn(?:-?(?:10|13))?[\s:]+/i, '')
    .replace(/[\s-]+/g, '')
    .toUpperCase();

  if (/^(978|979)\d{15}$/.test(cleaned)) {
    return cleaned.slice(0, 13);
  }

  return cleaned;
}

/**
 * Ověří platnost kontrolního součtu pro ISBN-10.
 * Přijímá syrový nebo vyčištěný vstup.
 */
export function isValidIsbn10(input: string): boolean {
  const cleaned = cleanIsbn(input);
  if (!/^\d{9}[\dX]$/.test(cleaned)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = cleaned[i];
    const value = char === 'X' ? 10 : Number(char);
    sum += (10 - i) * value;
  }

  return sum % 11 === 0;
}

/**
 * Ověří platnost kontrolního součtu pro ISBN-13 (EAN-13 začínající 978 nebo 979).
 * Přijímá syrový nebo vyčištěný vstup.
 */
export function isValidIsbn13(input: string): boolean {
  const cleaned = cleanIsbn(input);
  if (!/^(978|979)\d{10}$/.test(cleaned)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = Number(cleaned[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  return sum % 10 === 0;
}

/**
 * Převede platné ISBN-10 na ISBN-13 (prefix 978 + přepočet kontrolní číslice EAN-13).
 * Pokud vstup není platné ISBN-10, vrátí null.
 */
export function isbn10ToIsbn13(input: string): string | null {
  const cleaned = cleanIsbn(input);
  if (!isValidIsbn10(cleaned)) {
    return null;
  }

  const core = `978${cleaned.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(core[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return `${core}${checkDigit}`;
}

/**
 * Převede platné ISBN-13 (s prefixem 978) na ISBN-10.
 * Pro prefix 979 nebo neplatné ISBN-13 vrátí null.
 */
export function isbn13ToIsbn10(input: string): string | null {
  const cleaned = cleanIsbn(input);
  if (!isValidIsbn13(cleaned) || !cleaned.startsWith('978')) {
    return null;
  }

  const core = cleaned.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * Number(core[i]);
  }

  const remainder = (11 - (sum % 11)) % 11;
  const checkChar = remainder === 10 ? 'X' : String(remainder);
  return `${core}${checkChar}`;
}

/**
 * Normalizuje a validuje vstupní ISBN-10, ISBN-13 nebo knižní EAN-13 (včetně 18místného EAN-13+5).
 * Vrací normalizované 13místné ISBN-13 (bez pomlček) a případně původní ISBN-10.
 */
export function normalizeIsbn(input: string): NormalizedIsbnResult {
  const cleaned = cleanIsbn(input);

  if (!cleaned) {
    return {
      valid: false,
      error: 'Zadejte prosím ISBN-10 nebo ISBN-13.',
    };
  }

  if (cleaned.length === 10) {
    if (!/^\d{9}[\dX]$/.test(cleaned)) {
      return {
        valid: false,
        error: 'ISBN-10 musí obsahovat 9 číslic a poslední znak musí být číslice nebo X.',
      };
    }

    if (!isValidIsbn10(cleaned)) {
      return {
        valid: false,
        error: 'Neplatný kontrolní součet ISBN-10. Zkontrolujte prosím překlepy.',
      };
    }

    const isbn13 = isbn10ToIsbn13(cleaned);
    if (!isbn13) {
      return {
        valid: false,
        error: 'Nepodařilo se převést ISBN-10 na ISBN-13.',
      };
    }

    return {
      valid: true,
      isbn13,
      isbn10: cleaned,
      originalType: 'isbn10',
    };
  }

  if (cleaned.length === 13) {
    if (!/^\d{13}$/.test(cleaned)) {
      return {
        valid: false,
        error: 'ISBN-13 / EAN-13 smí obsahovat pouze číslice.',
      };
    }

    if (!cleaned.startsWith('978') && !cleaned.startsWith('979')) {
      return {
        valid: false,
        error: 'Knižní ISBN-13 / EAN-13 musí začínat prefixem 978 nebo 979.',
      };
    }

    if (!isValidIsbn13(cleaned)) {
      return {
        valid: false,
        error: 'Neplatný kontrolní součet ISBN-13. Zkontrolujte prosím překlepy.',
      };
    }

    return {
      valid: true,
      isbn13: cleaned,
      originalType: 'isbn13',
    };
  }

  return {
    valid: false,
    error: `ISBN musí mít 10 nebo 13 znaků (zadáno ${cleaned.length}).`,
  };
}

/**
 * Zformátuje normalizované 13místné ISBN pro čitelnější zobrazení v UI.
 * Používá oficiální rozsahy z knihovny isbn3 (včetně českého 978-80).
 */
export function formatIsbn13(isbn13: string): string {
  const cleaned = cleanIsbn(isbn13);
  if (cleaned.length !== 13) {
    return isbn13;
  }

  const hyphenated = ISBN.hyphenate(cleaned);
  if (hyphenated) {
    return hyphenated;
  }

  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5, 9)}-${cleaned.slice(9, 12)}-${cleaned.slice(12)}`;
}

/**
 * Vrátí všechny vyhledávací varianty platného ISBN (ISBN-13 bez pomlček i s oficiálními pomlčkami,
 * a pro prefix 978 také ISBN-10 bez pomlček i s pomlčkami).
 */
export function getIsbnSearchVariants(rawInput: string): IsbnSearchVariants | null {
  const normalized = normalizeIsbn(rawInput);
  if (!normalized.valid) {
    return null;
  }

  const { isbn13 } = normalized;
  const parsed = ISBN.parse(isbn13);

  const isbn13Hyphenated =
    parsed?.isbn13h || ISBN.hyphenate(isbn13) || formatIsbn13(isbn13);

  const isbn10 = normalized.isbn10 ?? isbn13ToIsbn10(isbn13) ?? undefined;
  const isbn10Hyphenated = isbn10
    ? parsed?.isbn10h || ISBN.hyphenate(isbn10) || undefined
    : undefined;

  const uniqueSet = new Set<string>([isbn13]);
  if (isbn13Hyphenated) uniqueSet.add(isbn13Hyphenated);
  if (isbn10) uniqueSet.add(isbn10);
  if (isbn10Hyphenated) uniqueSet.add(isbn10Hyphenated);

  return {
    isbn13,
    isbn13Hyphenated,
    isbn10,
    isbn10Hyphenated,
    allUnique: Array.from(uniqueSet),
  };
}
