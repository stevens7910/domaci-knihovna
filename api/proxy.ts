const ALLOWED_HOSTS = new Set([
  'aleph.nkp.cz',
  'cache.obalkyknih.cz',
  'covers.openlibrary.org',
  'openlibrary.org',
]);

const UPSTREAM_TIMEOUT_MS = 8000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: Request): Promise<Response> {
  const reqUrl = new URL(request.url);
  const rawTargetUrl = reqUrl.searchParams.get('url');

  if (!rawTargetUrl) {
    return new Response(
      JSON.stringify({
        error: 'Chybí povinný parametr "url". Použijte /api/proxy?url=...',
      }),
      {
        status: 400,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(rawTargetUrl);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Neplatný formát cílové URL.' }),
      {
        status: 400,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );
  }

  if (
    parsedTarget.protocol !== 'https:' ||
    !ALLOWED_HOSTS.has(parsedTarget.hostname)
  ) {
    return new Response(
      JSON.stringify({
        error: `Doména "${parsedTarget.hostname}" není na whitelistu povolených katalogů.`,
      }),
      {
        status: 403,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(parsedTarget.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'DomaciKnihovnaPWA/1.0',
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
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );
  } finally {
    clearTimeout(timer);
  }
}
