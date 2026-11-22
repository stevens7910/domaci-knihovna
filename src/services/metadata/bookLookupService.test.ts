import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanBookDescription } from '../../utils/text';
import {
  clearMetadataCache,
  lookupBookMetadata,
  mergeBookMetadata,
} from './bookLookupService';
import { CustomProxyProvider } from './customProxyProvider';
import { GoogleBooksProvider } from './googleBooksProvider';
import { OpenLibraryProvider } from './openLibraryProvider';

describe('bookLookupService & MetadataProviders', () => {
  beforeEach(async () => {
    await clearMetadataCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('vrátí chybu pro neplatné ISBN bez volání sítě', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupBookMetadata('978-0-306-40615-0');
    expect(result.status).toBe('error');
    expect(result.message).toContain('kontrolní součet');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('načte kompletní metadata z Google Books a převede http:// obálku na https://', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        totalItems: 1,
        items: [
          {
            volumeInfo: {
              title: 'R.U.R.',
              subtitle: 'Rossumovi univerzální roboti',
              authors: ['Karel Čapek'],
              publisher: 'Městská knihovna v Praze',
              publishedDate: '2018-05-10',
              pageCount: 112,
              language: 'cs',
              description: '<p>Klasické drama o <b>robotech</b>.<br/>Vyšlo v roce 1920 &amp; dodnes inspiruje &quot;sci-fi&quot;.&nbsp;</p>',
              imageLinks: {
                thumbnail: 'http://books.google.com/books/content?id=123&printsec=frontcover',
              },
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupBookMetadata('0-306-40615-2', {
      providers: [new GoogleBooksProvider(), new OpenLibraryProvider()],
    });

    expect(result.status).toBe('found');
    expect(result.data).toEqual({
      isbn13: '9780306406157',
      isbn10: '0306406152',
      title: 'R.U.R.',
      subtitle: 'Rossumovi univerzální roboti',
      authors: ['Karel Čapek'],
      publisher: 'Městská knihovna v Praze',
      publishedYear: 2018,
      pageCount: 112,
      language: 'cs',
      coverUrl: 'https://books.google.com/books/content?id=123&printsec=frontcover',
      description: 'Klasické drama o robotech.\nVyšlo v roce 1920 & dodnes inspiruje "sci-fi".',
      source: 'googlebooks',
    });
    // Protože Google Books vrátil všechna klíčová pole včetně obálky a počtu stran, Open Library se vůbec nemuselo volat
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('přejde na fallback Open Library, když Google Books knihu nenajde', async () => {
    const fetchMock = vi
      .fn()
      // 1. Google Books -> prázdné
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ totalItems: 0, items: [] }),
      })
      // 2. Open Library data API
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          'ISBN:9780306406157': {
            title: 'Dune',
            authors: [{ name: 'Frank Herbert' }],
            publishers: [{ name: 'Chilton Books' }],
            publish_date: 'August 1965',
            number_of_pages: 412,
          },
        }),
      })
      // 3. Open Library HEAD kontrola obálky
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupBookMetadata('978-0-306-40615-7', {
      providers: [new GoogleBooksProvider(), new OpenLibraryProvider()],
    });

    expect(result.status).toBe('found');
    expect(result.data).toMatchObject({
      isbn13: '9780306406157',
      title: 'Dune',
      authors: ['Frank Herbert'],
      publisher: 'Chilton Books',
      publishedYear: 1965,
      pageCount: 412,
      coverUrl: 'https://covers.openlibrary.org/b/isbn/9780306406157-M.jpg?default=false',
      source: 'openlibrary',
    });
  });

  it('chytře sloučí (merge) chybějící obálku a počet stran z Open Library do výsledku z Google Books', async () => {
    const fetchMock = vi
      .fn()
      // 1. Google Books vrátí název a autora, ale BEZ obálky a BEZ počtu stran
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          totalItems: 1,
          items: [
            {
              volumeInfo: {
                title: 'Válka s Mloky',
                authors: ['Karel Čapek'],
                publisher: 'Československý spisovatel',
                publishedDate: '1989',
                language: 'cs',
              },
            },
          ],
        }),
      })
      // 2. Open Library vrátí počet stran a obálku
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          'ISBN:9788025732823': {
            title: 'Válka s mloky (OL)',
            number_of_pages: 248,
          },
        }),
      })
      // 3. Open Library HEAD kontrola obálky -> 200 OK
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupBookMetadata('978-80-257-3282-3', {
      providers: [new GoogleBooksProvider(), new OpenLibraryProvider()],
    });

    expect(result.status).toBe('found');
    expect(result.data).toEqual({
      isbn13: '9788025732823',
      isbn10: undefined,
      title: 'Válka s Mloky', // Zůstal z primárního zdroje
      subtitle: undefined,
      authors: ['Karel Čapek'],
      publisher: 'Československý spisovatel',
      publishedYear: 1989,
      pageCount: 248, // Doplněno z Open Library
      language: 'cs',
      coverUrl: 'https://covers.openlibrary.org/b/isbn/9788025732823-M.jpg?default=false', // Doplněno z Open Library
      source: 'googlebooks', // Zdroj podle primárního názvu knihy
    });
  });

  it('využije mezipaměť (cache) při opakovaném dotazu na stejné ISBN', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        totalItems: 1,
        items: [
          {
            volumeInfo: {
              title: 'Bílá nemoc',
              authors: ['Karel Čapek'],
              pageCount: 96,
              imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await lookupBookMetadata('978-80-257-3282-3', {
      providers: [new GoogleBooksProvider()],
    });
    expect(first.status).toBe('found');
    expect(first.cached).toBe(false);

    const second = await lookupBookMetadata('9788025732823', {
      providers: [new GoogleBooksProvider()],
    });
    expect(second.status).toBe('found');
    expect(second.cached).toBe(true);
    expect(second.data?.title).toBe('Bílá nemoc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ošetří timeout / chybu sítě a vrátí status "error"', async () => {
    const slowProvider = {
      id: 'googlebooks' as const,
      displayName: 'Slow Google Books',
      fetchByIsbn: () =>
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 500);
        }),
    };

    const failingProvider = {
      id: 'openlibrary' as const,
      displayName: 'Failing Open Library',
      fetchByIsbn: async () => {
        throw new Error('Network failure');
      },
    };

    const result = await lookupBookMetadata('978-0-306-40615-7', {
      providers: [slowProvider, failingProvider],
      timeoutMs: 30,
      skipCache: true,
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('Nepodařilo se spojit');
  });

  it('aktivuje CustomProxyProvider pouze tehdy, když má nastavenou URL', async () => {
    const disabledProxy = new CustomProxyProvider('');
    expect(disabledProxy.isEnabled()).toBe(false);

    const enabledProxy = new CustomProxyProvider('https://proxy.example.cz/api/book');
    expect(enabledProxy.isEnabled()).toBe(true);

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        title: 'Babička',
        authors: ['Božena Němcová'],
        publisher: 'Česká knižnice',
        publishedYear: 2020,
        pageCount: 340,
        coverUrl: 'http://obalkyknih.cz/cover/123',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupBookMetadata('978-80-257-3282-3', {
      providers: [enabledProxy],
      skipCache: true,
    });

    expect(result.status).toBe('found');
    expect(result.data?.source).toBe('nkcr');
    expect(result.data?.title).toBe('Babička');
    expect(result.data?.coverUrl).toBe('https://obalkyknih.cz/cover/123');
  });

  it('vyčistí HTML tagy a entity v cleanBookDescription', () => {
    const raw =
      '<p>První <b>odstavec</b> &amp; <i>kurzíva</i>.</p><p>Druhý<br/>řádek s &quot;uvozovkami&quot;&nbsp;!</p>';
    expect(cleanBookDescription(raw)).toBe(
      'První odstavec & kurzíva.\n\nDruhý\nřádek s "uvozovkami" !'
    );
  });

  it('doplní chybějící popis ze sekundárního zdroje, pokud ho primární nevrátí', async () => {
    const primaryOpenLibrary = {
      id: 'openlibrary' as const,
      displayName: 'Open Library',
      fetchByIsbn: async () => ({
        isbn13: '9780141036144',
        title: 'Nineteen eighty-four',
        authors: ['George Orwell'],
        pageCount: 328,
        coverUrl: 'https://covers.openlibrary.org/b/isbn/9780141036144-M.jpg',
        source: 'openlibrary' as const,
      }),
    };

    const secondaryGoogleBooks = {
      id: 'googlebooks' as const,
      displayName: 'Google Books',
      fetchByIsbn: async () => ({
        isbn13: '9780141036144',
        title: '1984',
        description: 'Dystopický román o totalitní společnosti Velkého bratra.',
        source: 'googlebooks' as const,
      }),
    };

    const result = await lookupBookMetadata('9780141036144', {
      providers: [primaryOpenLibrary, secondaryGoogleBooks],
      skipCache: true,
    });

    expect(result.status).toBe('found');
    expect(result.data?.title).toBe('Nineteen eighty-four');
    expect(result.data?.source).toBe('openlibrary');
    expect(result.data?.description).toBe(
      'Dystopický román o totalitní společnosti Velkého bratra.'
    );
  });

  it('zpracuje oba formáty description v OpenLibraryProvider (objekt { value } i zálohu first_sentence/notes)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          'ISBN:9780140328721': {
            title: 'Fantastic Mr. Fox',
            authors: [{ name: 'Roald Dahl' }],
            description: { value: '<p>Mr. Fox steals food from <i>three</i> farmers.</p>' },
          },
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          'ISBN:9780345391803': {
            title: "The Hitchhiker's Guide to the Galaxy",
            authors: [{ name: 'Douglas Adams' }],
            first_sentence: { value: 'Far out in the uncharted backwaters...' },
            notes: 'Classic sci-fi comedy.',
          },
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenLibraryProvider();
    const res1 = await provider.fetchByIsbn('9780140328721');
    expect(res1?.description).toBe('Mr. Fox steals food from three farmers.');

    const res2 = await provider.fetchByIsbn('9780345391803');
    expect(res2?.description).toBe(
      'Far out in the uncharted backwaters...\n\nClassic sci-fi comedy.'
    );
  });

  it('při mergeBookMetadata preferuje delší a obsažnější popis', () => {
    const merged = mergeBookMetadata(
      {
        isbn13: '9780141036144',
        title: '1984',
        description: 'Krátký popis.',
        source: 'openlibrary',
      },
      {
        isbn13: '9780141036144',
        title: '1984',
        description:
          'Mnohem podrobnější a delší anotace románu George Orwella z roku 1949.',
        source: 'googlebooks',
      }
    );

    expect(merged?.description).toBe(
      'Mnohem podrobnější a delší anotace románu George Orwella z roku 1949.'
    );
    expect(merged?.source).toBe('openlibrary');
  });
});
