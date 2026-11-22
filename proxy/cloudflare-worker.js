/**
 * Cloudflare Worker – CORS proxy pro české knižní katalogy (NK ČR + Obálky knih)
 *
 * Nasazení:
 * 1. V Cloudflare Dashboard -> Workers & Pages -> Create Worker vložte tento skript a klikněte na Deploy.
 * 2. V projektu Domácí knihovna nastavte proměnnou prostředí:
 *    VITE_BOOK_PROXY_URL=https://vas-worker.vase-subdomena.workers.dev
 *
 * Volání z aplikace:
 *   GET /?target=nkcr&isbn=9788073356484
 *   GET /?target=obalkyknih&isbn=9788073356484
 */

const ALLOWED_ORIGINS = ['*']; // Můžete omezit např. na ['https://stevens7910.github.io', 'http://localhost:5173']

function getCorsHeaders(origin) {
  const allowOrigin =
    ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)
      ? origin || '*'
      : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
  };
}

const ALLOWED_UPSTREAM_HOSTS = ['aleph.nkp.cz', 'cache.obalkyknih.cz'];

function buildTargetUrl(target, isbn, rawUrlParam) {
  if (rawUrlParam) {
    try {
      const parsed = new URL(rawUrlParam);
      if (
        parsed.protocol === 'https:' &&
        ALLOWED_UPSTREAM_HOSTS.includes(parsed.hostname)
      ) {
        return {
          url: parsed.toString(),
          contentType:
            parsed.hostname === 'aleph.nkp.cz'
              ? 'application/xml; charset=utf-8'
              : 'application/json; charset=utf-8',
        };
      }
    } catch {
      // Fallback na target + isbn
    }
  }

  const cleanIsbn = String(isbn || '').replace(/[^0-9X]/gi, '');
  if (!/^(978|979)\d{10}$/.test(cleanIsbn)) {
    return null;
  }

  if (target === 'nkcr') {
    return {
      url: `https://aleph.nkp.cz/web/sru/skc?version=1.1&operation=searchRetrieve&query=isb%3D${encodeURIComponent(cleanIsbn)}&recordSchema=marcxml`,
      contentType: 'application/xml; charset=utf-8',
    };
  }

  if (target === 'obalkyknih') {
    const multi = encodeURIComponent(JSON.stringify([{ isbn: cleanIsbn }]));
    return {
      url: `https://cache.obalkyknih.cz/api/books?multi=${multi}`,
      contentType: 'application/json; charset=utf-8',
    };
  }

  return null;
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '*';
    const corsHeaders = getCorsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get('target');
    const isbn = reqUrl.searchParams.get('isbn');
    const rawUrlParam = reqUrl.searchParams.get('url');

    const resolved = buildTargetUrl(target, isbn, rawUrlParam);
    if (!resolved) {
      return new Response(
        JSON.stringify({
          error: 'Neplatné parametry. Použijte ?target=nkcr|obalkyknih&isbn=978...',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    try {
      const upstream = await fetch(resolved.url, {
        headers: {
          'User-Agent': 'DomaciKnihovnaPWA/1.0 (+https://github.com/stevens7910/domaci-knihovna)',
          Accept: resolved.contentType,
        },
      });

      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          'Content-Type':
            upstream.headers.get('Content-Type') || resolved.contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: 'Chyba při komunikaci s cílovým katalogem.',
          detail: err instanceof Error ? err.message : String(err),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
