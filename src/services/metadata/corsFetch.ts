/**
 * Provede HTTP GET požadavek na targetUrl a při CORS / síťové chybě v prohlížeči
 * automaticky zkusí veřejný CORS proxy fallback (allorigins.win).
 */
export async function fetchWithCorsFallback(
  targetUrl: string,
  signal?: AbortSignal
): Promise<Response> {
  try {
    const directResponse = await fetch(targetUrl, { signal });
    if (directResponse.ok) {
      return directResponse;
    }
    // Pokud přímý server odpověděl např. 404/500, vrátíme jeho odpověď bez maskování
    return directResponse;
  } catch (err) {
    // Pokud byl požadavek přerušen timeoutem / AbortControllerem, nepokračujeme
    if (signal?.aborted) {
      throw err;
    }

    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    return fetch(proxyUrl, { signal });
  }
}
