import { describe, expect, it } from 'vitest';
import {
  cleanIsbn,
  formatIsbn13,
  getIsbnSearchVariants,
  isbn10ToIsbn13,
  isValidIsbn10,
  isValidIsbn13,
  normalizeIsbn,
} from './isbn';

describe('cleanIsbn', () => {
  it('odstraní mezery, pomlčky a prefix ISBN', () => {
    expect(cleanIsbn('978-80-257-2812-3')).toBe('9788025728123');
    expect(cleanIsbn('ISBN 80-7203-717-x')).toBe('807203717X');
    expect(cleanIsbn('ISBN-13: 978 80 200 1234 0')).toBe('9788020012340');
    expect(cleanIsbn('  0-306-40615-2  ')).toBe('0306406152');
  });
});

describe('isValidIsbn10', () => {
  it('přijme platné ISBN-10 s číselnou kontrolní číslicí', () => {
    expect(isValidIsbn10('0-306-40615-2')).toBe(true);
    expect(isValidIsbn10('0306406152')).toBe(true);
    expect(isValidIsbn10('80-200-0980-9')).toBe(true);
  });

  it('přijme platné ISBN-10 s kontrolním znakem X (malé i velké)', () => {
    expect(isValidIsbn10('0-8044-2957-X')).toBe(true);
    expect(isValidIsbn10('080442957x')).toBe(true);
  });

  it('odmítne neplatný kontrolní součet nebo špatnou délku', () => {
    expect(isValidIsbn10('0-306-40615-3')).toBe(false);
    expect(isValidIsbn10('0-8044-2957-0')).toBe(false);
    expect(isValidIsbn10('123456789')).toBe(false);
    expect(isValidIsbn10('9780306406157')).toBe(false);
    expect(isValidIsbn10('03064061X2')).toBe(false);
  });
});

describe('isValidIsbn13', () => {
  it('přijme platné ISBN-13 s prefixem 978 i 979', () => {
    expect(isValidIsbn13('978-0-306-40615-7')).toBe(true);
    expect(isValidIsbn13('9780306406157')).toBe(true);
    expect(isValidIsbn13('979-10-323-0569-0')).toBe(true);
    expect(isValidIsbn13('978-80-257-3282-3')).toBe(true);
  });

  it('odmítne neplatný kontrolní součet', () => {
    expect(isValidIsbn13('978-0-306-40615-8')).toBe(false);
    expect(isValidIsbn13('979-10-323-0569-1')).toBe(false);
  });

  it('odmítne EAN-13 bez knižního prefixu 978/979 (např. 859)', () => {
    // 8594000000018 má platný EAN-13 checksum, ale není to kniha (prefix 859)
    expect(isValidIsbn13('8594000000018')).toBe(false);
  });

  it('odmítne špatnou délku nebo nepovolené znaky', () => {
    expect(isValidIsbn13('978030640615')).toBe(false);
    expect(isValidIsbn13('978030640615X')).toBe(false);
  });
});

describe('isbn10ToIsbn13', () => {
  it('převede platné ISBN-10 na odpovídající ISBN-13', () => {
    expect(isbn10ToIsbn13('0-306-40615-2')).toBe('9780306406157');
    expect(isbn10ToIsbn13('0-8044-2957-X')).toBe('9780804429573');
    expect(isbn10ToIsbn13('80-200-0980-9')).toBe('9788020009807');
  });

  it('vrátí null pro neplatné ISBN-10', () => {
    expect(isbn10ToIsbn13('0-306-40615-9')).toBeNull();
    expect(isbn10ToIsbn13('9780306406157')).toBeNull();
  });
});

describe('normalizeIsbn', () => {
  it('normalizuje ISBN-10 a doplní isbn13 i isbn10', () => {
    const result = normalizeIsbn('ISBN 0-8044-2957-x');
    expect(result).toEqual({
      valid: true,
      isbn13: '9780804429573',
      isbn10: '080442957X',
      originalType: 'isbn10',
    });
  });

  it('normalizuje ISBN-13 s pomlčkami a mezerami', () => {
    const result = normalizeIsbn('978-0-306-40615-7');
    expect(result).toEqual({
      valid: true,
      isbn13: '9780306406157',
      originalType: 'isbn13',
    });
  });

  it('vrátí srozumitelnou českou chybu pro prázdný vstup, špatný prefix i kontrolní součet', () => {
    const empty = normalizeIsbn('   ');
    expect(empty.valid).toBe(false);

    const wrongPrefix = normalizeIsbn('8594000000018');
    expect(wrongPrefix.valid).toBe(false);
    if (!wrongPrefix.valid) {
      expect(wrongPrefix.error).toContain('978 nebo 979');
    }

    const badChecksum = normalizeIsbn('978-0-306-40615-0');
    expect(badChecksum.valid).toBe(false);
    if (!badChecksum.valid) {
      expect(badChecksum.error).toContain('kontrolní součet');
    }

    const wrongLength = normalizeIsbn('978-80');
    expect(wrongLength.valid).toBe(false);
    if (!wrongLength.valid) {
      expect(wrongLength.error).toContain('10 nebo 13');
    }
  });
});

describe('formatIsbn13', () => {
  it('zformátuje 13místné české ISBN podle oficiálních rozsahů isbn3', () => {
    expect(formatIsbn13('9788025732823')).toBe('978-80-257-3282-3');
    expect(formatIsbn13('9788025739549')).toBe('978-80-257-3954-9');
  });

  it('vrátí původní řetězec, pokud nemá 13 číslic', () => {
    expect(formatIsbn13('12345')).toBe('12345');
  });
});

describe('EAN-13+5 a getIsbnSearchVariants', () => {
  it('ořízne 18místný čárový kód (EAN-13 + 5místný cenový doplněk EAN-5) na prvních 13 číslic', () => {
    expect(cleanIsbn('978802573954900399')).toBe('9788025739549');
    const normalized = normalizeIsbn('978802573954900399');
    expect(normalized).toEqual({
      valid: true,
      isbn13: '9788025739549',
      originalType: 'isbn13',
    });
  });

  it('vygeneruje všechny vyhledávací varianty pro české ISBN (bez pomlček, s pomlčkami, ISBN-10)', () => {
    const variants = getIsbnSearchVariants('978802573954900399');
    expect(variants).toEqual({
      isbn13: '9788025739549',
      isbn13Hyphenated: '978-80-257-3954-9',
      isbn10: '8025739546',
      isbn10Hyphenated: '80-257-3954-6',
      allUnique: [
        '9788025739549',
        '978-80-257-3954-9',
        '8025739546',
        '80-257-3954-6',
      ],
    });
  });

  it('vrátí null pro neplatné ISBN', () => {
    expect(getIsbnSearchVariants('978-80-257-3954-0')).toBeNull();
  });
});
