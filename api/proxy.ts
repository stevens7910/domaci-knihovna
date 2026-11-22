import type { IncomingMessage, ServerResponse } from 'http';

const ALLOWED_HOSTS = new Set([
  'www.knihovny.cz',
  'aleph.nkp.cz',
  'cache.obalkyknih.cz',
  'covers.openlibrary.org',
  'openlibrary.org',
]);

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const host = req.headers.host || 'localhost';
  const parsedReqUrl = new URL(req.url || '/', `https://${host}`);
  const targetUrlRaw = parsedReqUrl.searchParams.get('url');

  if (!targetUrlRaw) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Missing url query parameter' }));
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(targetUrlRaw);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Invalid target URL' }));
    return;
  }

  if (
    targetUrl.protocol !== 'https:' ||
    !ALLOWED_HOSTS.has(targetUrl.hostname)
  ) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({ error: `Host not allowed: ${targetUrl.hostname}` })
    );
    return;
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      'User-Agent': 'DomaciKnihovnaPWA/1.0',
      Accept: 'application/json, application/xml, text/xml, image/*, */*',
    };

    if (targetUrl.hostname === 'cache.obalkyknih.cz') {
      upstreamHeaders.Referer = 'https://www.knihovny.cz/';
    }

    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(8000),
    });

    const contentType =
      upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.statusCode = upstream.status;
    res.setHeader('Content-Type', contentType);
    if (upstream.ok) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    res.end(buffer);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Upstream fetch failed',
      })
    );
  }
}
