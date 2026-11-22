// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCzechIsbn, lookupBookMetadata } from './bookLookupService';
import { buildRequestUrl } from './corsFetch';
import { buildNkcrSruQuery, NkcrProvider, parseNkcrMarcXml } from './nkcrProvider';
import { buildObalkyKnihUrl, ObalkyKnihProvider } from './obalkyKnihProvider';

const SAMPLE_NKCR_MARCXML = `<?xml version="1.0" encoding="UTF-8"?>
<zs:searchRetrieveResponse xmlns:zs="http://www.loc.gov/zing/srw/">
  <zs:version>1.1</zs:version>
  <zs:numberOfRecords>1</zs:numberOfRecords>
  <zs:records>
    <zs:record>
      <zs:recordSchema>marcxml</zs:recordSchema>
      <zs:recordData>
        <marc:record xmlns:marc="http://www.loc.gov/MARC21/slim">
          <marc:datafield tag="100" ind1="1" ind2=" ">
            <marc:subfield code="a">Čapek, Karel,</marc:subfield>
            <marc:subfield code="7">jk01021023</marc:subfield>
          </marc:datafield>
          <marc:datafield tag="245" ind1="1" ind2="0">
            <marc:subfield code="a">Válka s Mloky :</marc:subfield>
            <marc:subfield code="b">román /</marc:subfield>
            <marc:subfield code="c">Karel Čapek</marc:subfield>
          </marc:datafield>
          <marc:datafield tag="264" ind1=" " ind2="1">
            <marc:subfield code="a">Praha :</marc:subfield>
            <marc:subfield code="b">Leda,</marc:subfield>
            <marc:subfield code="c">2020</marc:subfield>
          </marc:datafield>
          <marc:datafield tag="300" ind1=" " ind2=" ">
            <marc:subfield code="a">256 s. ;</marc:subfield>
            <marc:subfield code="c">21 cm</marc:subfield>
          </marc:datafield>
          <marc:datafield tag="520" ind1=" " ind2=" ">
            <marc:subfield code="a">Satirický sci-fi román o střetu lidské civilizace s inteligentními mloky.</marc:subfield>
          </marc:datafield>
          <marc:datafield tag="700" ind1="1" ind2=" ">
            <marc:subfield code="a">Čapek, Josef,</marc:subfield>
            <marc:subfield code="4">ill</marc:subfield>
          </marc:datafield>
        </marc:record>
      </zs:recordData>
    </zs:record>
  </zs:records>
</zs:searchRetrieveResponse>`;

const EMPTY_NKCR_MARCXML = `<?xml version="1.0" encoding="UTF-8"?>
<zs:searchRetrieveResponse xmlns:zs="http://www.loc.gov/zing/srw/">
  <zs:version>1.1</zs:version>
  <zs:numberOfRecords>0</zs:numberOfRecords>
</zs:searchRetrieveResponse>`;

describe('parseNkcrMarcXml & diagnostika českých zdrojů', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('správně vyparsuje reálnou MARCXML odpověď včetně oříznutí interpunkce a převodu jmen autorů', () => {
    const parsed = parseNkcrMarcXml(SAMPLE_NKCR_MARCXML, '9788073356484');

    expect(parsed).toEqual({
      isbn13: '9788073356484',
      title: 'Válka s Mloky',
      subtitle: 'román',
      authors: ['Karel Čapek', 'Josef Čapek'],
      publisher: 'Leda',
      publishedYear: 2020,
      pageCount: 256,
      description: 'Satirický sci-fi román o střetu lidské civilizace s inteligentními mloky.',
      language: 'cs',
      source: 'nkcr',
    });
  });

  it('vrátí null, pokud je numberOfRecords rovno 0', () => {
    expect(parseNkcrMarcXml(EMPTY_NKCR_MARCXML, '9788073356484')).toBeNull();
  });

  it('rozpozná české ISBN (97880 / 97980)', () => {
    expect(isCzechIsbn('9788073356484')).toBe(true);
    expect(isCzechIsbn('9798000000015')).toBe(true);
    expect(isCzechIsbn('9780141036144')).toBe(false);
  });

  it('ObalkyKnihProvider extrahuje obálku, vyčištěnou HTML anotaci a rok', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          cover_preview510_url: 'http://cache.obalkyknih.cz/file/cover/12345.jpg',
          bib_title: 'Válka s Mloky',
          bib_author: 'Karel Čapek',
          bib_year: '2020',
          annotation: {
            html: '<p>Slavný <b>utopický</b> román Karla Čapka.</p>',
          },
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new ObalkyKnihProvider();
    const res = await provider.fetchByIsbn('9788073356484');

    expect(res).toEqual({
      isbn13: '9788073356484',
      title: 'Válka s Mloky',
      authors: ['Karel Čapek'],
      publishedYear: 2020,
      coverUrl: 'https://cache.obalkyknih.cz/file/cover/12345.jpg',
      description: 'Slavný utopický román Karla Čapka.',
      language: 'cs',
      source: 'obalkyknih',
    });
  });

  it('pro české ISBN upřednostní paralelně NK ČR + Obálky knih, sloučí obálku i anotaci a zaznamená outcome "ok"', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('aleph.nkp.cz')) {
        return {
          ok: true,
          status: 200,
          text: async () => SAMPLE_NKCR_MARCXML,
        };
      }
      if (url.includes('obalkyknih.cz')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              cover_preview510_url: 'http://cache.obalkyknih.cz/file/cover/999.jpg',
              annotation: {
                html: '<p>Velmi podrobná česká anotace knihy Válka s Mloky z portálu Obálky knih, která je delší než krátký záznam v NK ČR.</p>',
              },
            },
          ],
        };
      }
      return { ok: false, status: 404 };
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupBookMetadata('978-80-7335-648-4', {
      skipCache: true,
    });

    expect(result.status).toBe('found');
    expect(result.data).toMatchObject({
      isbn13: '9788073356484',
      title: 'Válka s Mloky',
      authors: ['Karel Čapek', 'Josef Čapek'],
      publisher: 'Leda',
      publishedYear: 2020,
      pageCount: 256,
      coverUrl: 'https://cache.obalkyknih.cz/file/cover/999.jpg',
      description:
        'Velmi podrobná česká anotace knihy Válka s Mloky z portálu Obálky knih, která je delší než krátký záznam v NK ČR.',
      source: 'nkcr',
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'NK ČR', outcome: 'ok', httpStatus: 200 }),
        expect.objectContaining({ provider: 'Obálky knih', outcome: 'ok', httpStatus: 200 }),
      ])
    );
  });

  it('při CORS/síťové chybě bez VITE_BOOK_PROXY_URL nepoužije veřejnou proxy, zaznamená outcome "cors_or_network" a nemaskuje stav jako "not_found"', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('aleph.nkp.cz') || url.includes('obalkyknih.cz')) {
        throw new TypeError('Failed to fetch');
      }
      // Google Books a Open Library vrátí prázdný výsledek (empty)
      return {
        ok: true,
        status: 200,
        json: async () => ({ totalItems: 0, items: [] }),
      };
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupBookMetadata('978-80-7335-648-4', {
      skipCache: true,
    });

    // Žádný požadavek nesměl jít na veřejnou proxy allorigins.win
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes('allorigins.win'))).toBe(false);

    // Stav není zamaskován jako 'not_found', ale vrací 'error' s diagnostikou 'cors_or_network'
    expect(result.status).toBe('error');
    expect(result.message).toContain('VITE_BOOK_PROXY_URL');

    const nkcrDiag = result.diagnostics.find((d) => d.providerId === 'nkcr');
    const obalkyDiag = result.diagnostics.find((d) => d.providerId === 'obalkyknih');
    const googleDiag = result.diagnostics.find((d) => d.providerId === 'googlebooks');

    expect(nkcrDiag?.outcome).toBe('cors_or_network');
    expect(obalkyDiag?.outcome).toBe('cors_or_network');
    expect(googleDiag?.outcome).toBe('empty');
  });

  it('správně diagnostikuje "parse_error" při neplatném XML/JSON a "http_error" při chybovém HTTP kódu', async () => {
    const fetchMock = vi
      .fn()
      // 1. NK ČR vrátí poškozené / HTML tělo místo MARCXML
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body>Unexpected HTML gateway page</body></html>',
      })
      // 2. Obálky knih vrátí HTTP 503
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupBookMetadata('978-80-7335-648-4', {
      providers: [new NkcrProvider(), new ObalkyKnihProvider()],
      skipCache: true,
    });

    expect(result.status).toBe('error');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        provider: 'NK ČR',
        outcome: 'parse_error',
      }),
      expect.objectContaining({
        provider: 'Obálky knih',
        outcome: 'http_error',
        httpStatus: 503,
      }),
    ]);
  });

  it('sestaví výchozí /api/proxy URL i vlastní VITE_BOOK_PROXY_URL', () => {
    const defaultBuilt = buildRequestUrl({
      target: 'nkcr',
      isbn13: '9788073356484',
      directUrl: 'https://aleph.nkp.cz/web/sru/skc?query=isb%3D9788073356484',
    });

    expect(defaultBuilt.usingProxy).toBe(true);
    expect(defaultBuilt.requestUrl).toBe(
      `/api/proxy?url=${encodeURIComponent(
        'https://aleph.nkp.cz/web/sru/skc?query=isb%3D9788073356484'
      )}`
    );

    const built = buildRequestUrl({
      target: 'nkcr',
      isbn13: '9788073356484',
      directUrl: 'https://aleph.nkp.cz/web/sru/skc?query=isb%3D9788073356484',
      proxyBaseUrl: 'https://my-proxy.workers.dev',
    });

    expect(built.usingProxy).toBe(true);
    expect(built.requestUrl).toBe(
      `https://my-proxy.workers.dev?url=${encodeURIComponent(
        'https://aleph.nkp.cz/web/sru/skc?query=isb%3D9788073356484'
      )}`
    );
  });

  it('sestaví SRU dotaz s OR pro všechny varianty ISBN a multi pole pro Obálky knih s isbn13 i isbn10', () => {
    const query = buildNkcrSruQuery('9788025739549');
    expect(query).toBe(
      'isb="9788025739549" OR isb="978-80-257-3954-9" OR isb="8025739546" OR isb="80-257-3954-6"'
    );

    const obalkyUrl = decodeURIComponent(buildObalkyKnihUrl('9788025739549'));
    expect(obalkyUrl).toContain('{"isbn":"9788025739549"}');
    expect(obalkyUrl).toContain('{"isbn":"8025739546"}');
  });
});
