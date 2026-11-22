/**
 * Cloudflare Worker – CORS proxy pro české i zahraniční knižní katalogy
 *
 * Podporované parametry:
 *   GET /?url=<encodedTargetUrl>
 *   (zpětně kompatibilní i s GET /?target=nkcr|obalkyknih&isbn=978...)
 *
 * Povolené cílové domény (bezpečnostní whitelist):
 *   - aleph.nkp.cz
 *   - cache.obalkyknih.cz
 *   - covers.openlibrary.org
 *   - openlibrary.org
 */

const ALLOWED_HOSTS = new Set([
  'aleph.nkp.cz',
  'cache.obalkyknih.cz',
  'covers.openlibrary.org',
  'openlibrary.org',
]);

const UPSTREAM_TIMEOUT_MS = 8000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function resolveTargetUrl(searchParams) {
  const rawUrl = searchParams.get('url');
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:' && ALLOWED_HOSTS.has(parsed.hostname)) {
        return parsed.toString();
      }
      return null;
    } catch {
      return null;
    }
  }

  // Volitelný zkrácený režim: ?target=nkcr|obalkyknih&isbn=978...
  const target = searchParams.get('target');
  const cleanIsbn = String(searchParams.get('isbn') || '').replace(/[^0-9X]/gi, '');
  if (!/^(978|979)\d{10}$/.test(cleanIsbn)) {
    return null;
  }

  if (target === 'nkcr') {
    return `https://aleph.nkp.cz/web/sru/skc?version=1.1&operation=searchRetrieve&query=isb%3D${encodeURIComponent(cleanIsbn)}&recordSchema=marcxml`;
  }

  if (target === 'obalkyknih') {
    const multi = encodeURIComponent(JSON.stringify([{ isbn: cleanIsbn }]));
    return `https://cache.obalkyknih.cz/api/books?multi=${multi}`;
  }

  return null;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const reqUrl = new URL(request.url);
    const targetUrl = resolveTargetUrl(reqUrl.searchParams);

    if (!targetUrl) {
      return new Response(
        JSON.stringify({
          error:
            'Neplatný nebo nepovolený parametr url. Povolené domény: aleph.nkp.cz, cache.obalkyknih.cz, covers.openlibrary.org, openlibrary.org.',
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const upstream = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'DomaciKnihovnaPWA/1.0 (+https://github.com/stevens7910/domaci-knihovna)',
          Accept: 'application/xml, text/xml, application/json, image/*, */*;q=0.8',
        },
      });

      const contentType =
        upstream.headers.get('Content-Type') || 'application/octet-stream';

      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': contentType,
          'Cache-Control': upstream.ok ? 'public, max-age=86400' : 'no-store',
        },
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      return new Response(
        JSON.stringify({
          error: isTimeout
            ? 'Vypršel časový limit cílového katalogu.'
            : 'Chyba při komunikaci s cílovým katalogem.',
          detail: err instanceof Error ? err.message : String(err),
        }),
        {
          status: isTimeout ? 504 : 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    } finally {
      clearTimeout(timer);
    }
  },
};
