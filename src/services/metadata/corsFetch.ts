import {
  createResponseSnippet,
  MetadataProviderError,
} from './MetadataProvider';

export const BOOK_PROXY_STORAGE_KEY = 'domaci_knihovna_book_proxy_url';

export type ProxyTargetId = 'nkcr' | 'obalkyknih';

/**
 * Vrátí nakonfigurovanou URL vlastního proxy endpointu (VITE_BOOK_PROXY_URL nebo localStorage).
 * Veřejné CORS proxy nejsou používány kvůli nespolehlivosti.
 */
export function getConfiguredBookProxyUrl(): string | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(BOOK_PROXY_STORAGE_KEY);
      if (stored && stored.trim()) {
        return stored.trim();
      }
    }
  } catch {
    // Ignorovat chyby přístupu k localStorage
  }

  const envUrl = import.meta.env?.VITE_BOOK_PROXY_URL as string | undefined;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }

  return undefined;
}

/**
 * Sestaví URL pro dotaz přes vlastní proxy (Cloudflare Worker / Vercel funkci),
 * nebo vrátí přímou cílovou URL, pokud vlastní proxy není nastavena.
 */
export function buildRequestUrl(options: {
  target: ProxyTargetId;
  isbn13: string;
  directUrl: string;
  proxyBaseUrl?: string;
}): { requestUrl: string; usingProxy: boolean } {
  const proxyBase = options.proxyBaseUrl ?? getConfiguredBookProxyUrl();
  if (!proxyBase) {
    return { requestUrl: options.directUrl, usingProxy: false };
  }

  const separator = proxyBase.includes('?') ? '&' : '?';
  const requestUrl = `${proxyBase}${separator}target=${encodeURIComponent(
    options.target
  )}&isbn=${encodeURIComponent(options.isbn13)}&url=${encodeURIComponent(
    options.directUrl
  )}`;

  return { requestUrl, usingProxy: true };
}

/**
 * Provede HTTP GET požadavek buď přes vlastní VITE_BOOK_PROXY_URL (pokud je nastaveno),
 * nebo přímo na cílový server.
 * Při selhání vyhodí strukturovanou MetadataProviderError ('cors_or_network', 'http_error', 'timeout')
 * včetně prvních 200 znaků odpovědi/chyby pro mobilní diagnostiku.
 */
export async function fetchWithBookProxy(options: {
  target: ProxyTargetId;
  isbn13: string;
  directUrl: string;
  signal?: AbortSignal;
  proxyBaseUrl?: string;
}): Promise<Response> {
  const { requestUrl, usingProxy } = buildRequestUrl(options);

  let response: Response;
  try {
    response = await fetch(requestUrl, { signal: options.signal });
  } catch (err) {
    if (
      options.signal?.aborted ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      throw new MetadataProviderError({
        outcome: 'timeout',
        requestUrl,
        detail: 'Vypršel časový limit dotazu.',
      });
    }

    const reason =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new MetadataProviderError({
      outcome: 'cors_or_network',
      requestUrl,
      responseSnippet: createResponseSnippet(reason),
      detail: usingProxy
        ? `Chyba spojení s vlastním proxy serverem (${reason}).`
        : `Přímý dotaz zablokován CORS politikou nebo chybou sítě (VITE_BOOK_PROXY_URL není nastaveno).`,
    });
  }

  if (!response.ok) {
    let bodySnippet: string | undefined;
    try {
      if (typeof response.text === 'function') {
        bodySnippet = createResponseSnippet(await response.text());
      }
    } catch {
      // Ignorovat chybu čtení chybového těla
    }

    throw new MetadataProviderError({
      outcome: 'http_error',
      httpStatus: response.status,
      requestUrl,
      responseSnippet: bodySnippet,
      detail: `Server vrátil HTTP ${response.status}.`,
    });
  }

  return response;
}
