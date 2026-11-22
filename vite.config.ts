/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const appVersion = `build ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const ALLOWED_PROXY_HOSTS = new Set([
  'www.knihovny.cz',
  'aleph.nkp.cz',
  'cache.obalkyknih.cz',
  'covers.openlibrary.org',
  'openlibrary.org',
]);

/**
 * Lokální dev middleware pro /api/proxy, aby aplikace fungovala při `npm run dev`
 * úplně stejně jako na Vercelu s `api/proxy.ts`.
 */
function localBookProxyPlugin(): Plugin {
  return {
    name: 'local-book-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (rawReq, res) => {
        const req = rawReq as { method?: string; url?: string };
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const reqUrl = new URL(req.url || '/', 'http://localhost');
        const rawTargetUrl = reqUrl.searchParams.get('url');

        if (!rawTargetUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Chybí parametr "url".' }));
          return;
        }

        let parsedTarget: URL;
        try {
          parsedTarget = new URL(rawTargetUrl);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Neplatná cílová URL.' }));
          return;
        }

        if (
          parsedTarget.protocol !== 'https:' ||
          !ALLOWED_PROXY_HOSTS.has(parsedTarget.hostname)
        ) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              error: `Doména "${parsedTarget.hostname}" není povolena.`,
            })
          );
          return;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);

        try {
          const upstreamHeaders: Record<string, string> = {
            'User-Agent': 'DomaciKnihovnaPWA/1.0',
            Accept:
              'application/xml, text/xml, application/json, image/*, */*;q=0.8',
          };
          if (parsedTarget.hostname === 'cache.obalkyknih.cz') {
            upstreamHeaders.Referer = 'https://www.knihovny.cz/';
          }

          const upstream = await fetch(parsedTarget.toString(), {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: upstreamHeaders,
          });

          res.statusCode = upstream.status;
          const contentType = upstream.headers.get('content-type');
          if (contentType) {
            res.setHeader('Content-Type', contentType);
          }

          const bytes = new Uint8Array(await upstream.arrayBuffer());
          res.end(bytes);
        } catch (err) {
          const isTimeout = err instanceof Error && err.name === 'AbortError';
          res.statusCode = isTimeout ? 504 : 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              error: isTimeout
                ? 'Vypršel časový limit cílového katalogu.'
                : 'Chyba při komunikaci s cílovým katalogem.',
            })
          );
        } finally {
          clearTimeout(timer);
        }
      });
    },
  };
}

export default defineConfig({
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    localBookProxyPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Domácí knihovna',
        short_name: 'Knihovna',
        description: 'Offline-first katalog vaší domácí knihovny',
        lang: 'cs',
        theme_color: '#9a3412',
        background_color: '#faf8f5',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
