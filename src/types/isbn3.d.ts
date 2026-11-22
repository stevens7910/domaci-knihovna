declare module 'isbn3' {
  export interface Isbn3Parsed {
    isValid: boolean;
    isIsbn10: boolean;
    isIsbn13: boolean;
    isbn10?: string;
    isbn10h?: string;
    isbn13?: string;
    isbn13h?: string;
    group?: string;
    groupname?: string;
    publisher?: string;
    article?: string;
    check?: string;
  }

  const ISBN: {
    parse(input: string): Isbn3Parsed | null;
    hyphenate(input: string): string | null;
    asIsbn10(input: string, hyphenate?: boolean): string | null;
    asIsbn13(input: string, hyphenate?: boolean): string | null;
  };

  export default ISBN;
}
