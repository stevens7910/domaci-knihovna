# Domácí knihovna (Offline-first PWA)

Moderní offline-first webová aplikace (PWA) v češtině pro katalogizaci domácí knihovny. Všechna data i stažené obálky knih jsou uloženy lokálně v prohlížeči pomocí **IndexedDB (Dexie.js)**, takže aplikace spolehlivě funguje i bez připojení k internetu.

## Hlavní funkce
- **Správa knih a umístění:** Evidence názvu, autorů, ISBN-10/13, nakladatelství, roku vydání, počtu stran, vlastních štítků, umístění v bytě a stavu přečtení (*Nepřečteno*, *Rozečteno*, *Přečteno*, *Půjčeno* včetně jména vypůjčitele).
- **Validace a normalizace ISBN:** Kontrola kontrolních součtů ISBN-10 i ISBN-13 / EAN-13 (`978`/`979`), automatický převod ISBN-10 → ISBN-13 a detekce duplicit.
- **Vyhledávání metadat podle ISBN:** Modulární napojení na Google Books a Open Library (včetně 7denní cache v IndexedDB a podpory volitelného CORS proxy endpointu pro NK ČR přes `VITE_CUSTOM_METADATA_PROXY_URL`).
- **Skenování čárových kódů kamerou:** Čtečka EAN-13 přes `@zxing/browser` s podporou svítilny (`torch`), přepínáním kamer, zvukovou/haptickou odezvou a **Rychlým dávkovým režimem (Batch scan)**.
- **Offline obálky a zálohování:** Automatické ukládání obálek jako `Blob` přímo do IndexedDB, přehled statistik a export/import kompletní zálohy ve formátu `.json`.

---

## Lokální spuštění a testy

```bash
# Instalace závislostí
npm install

# Spuštění vývojového serveru
npm run dev

# Spuštění unit testů (Vitest)
npm run test

# Produkční build (TypeScript kontrola + Vite + PWA Service Worker)
npm run build

# Lokální náhled produkčního buildu (včetně aktivního Service Workeru)
npm run preview
```

---

## Nasazení na produkční HTTPS hosting

Přístup ke kameře (`getUserMedia`) i instalace PWA (Service Worker) vyžadují v produkci **HTTPS** (kromě `localhost`). Aplikace používá relativní cesty (`base: './'`, `start_url: './'`, `scope: './'`), takže funguje jak na kořenové doméně, tak v podsložce.

### Varianta A: Vercel / Netlify (doporučeno)
1. Připojte repozitář k Vercel nebo Netlify.
2. Nastavte build command na `npm run build` a výstupní složku na `dist`.
3. Hosting automaticky zajistí HTTPS certifikát i správné hlavičky pro PWA.

### Varianta B: GitHub Pages
1. Sestavte projekt příkazem `npm run build` (případně nastavte `VITE_BASE_PATH=/nazev-repozitare/`).
2. Publikujte obsah složky `dist/` do větve `gh-pages` (např. přes `gh-pages` nebo GitHub Actions workflow).
3. GitHub Pages automaticky servíruje web přes HTTPS.

---

## Vlastní CORS Proxy pro české katalogy (`VITE_BOOK_PROXY_URL`)

České knižní katalogy (**Národní knihovna ČR – `aleph.nkp.cz`**) neposílají hlavičku `Access-Control-Allow-Origin` pro přímé dotazy z prohlížeče. Aplikace záměrně **nepoužívá nespolehlivé veřejné CORS proxy** a při selhání přímého dotazu zobrazí v detailu *„Technický stav zdrojů“* přesný diagnostický stav (`cors_or_network`, `http_error`, `parse_error`, `timeout`, `empty`, `ok`).

Pro 100% spolehlivé dotazování NK ČR a Obálek knih je v [proxy/cloudflare-worker.js](proxy/cloudflare-worker.js) připravena šablona pro bezplatný **Cloudflare Worker** (s whitelistem pro `aleph.nkp.cz`, `cache.obalkyknih.cz`, `covers.openlibrary.org` a `openlibrary.org`):

1. Přihlaste se do [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create Worker**.
2. Vložte obsah souboru [proxy/cloudflare-worker.js](proxy/cloudflare-worker.js) a klikněte na **Deploy**. Získáte URL typu `https://domaci-knihovna-proxy.vase-jmeno.workers.dev`.
3. Nastavte tuto URL do GitHub repozitáře pro automatický build GitHub Pages:
   - Otevřete na GitHubu **Settings → Secrets and variables → Actions → záložka Variables → New repository variable**.
   - **Name:** `VITE_BOOK_PROXY_URL`
   - **Value:** `https://domaci-knihovna-proxy.vase-jmeno.workers.dev`
4. Spusťte znovu workflow **Nasazení PWA na GitHub Pages** (nebo pushněte změnu do `main`). Workflow automaticky předá `VITE_BOOK_PROXY_URL: ${{ vars.VITE_BOOK_PROXY_URL }}` do `npm run build`.
5. Pro lokální vývoj můžete stejnou proměnnou přidat do `.env.local`:
   ```env
   VITE_BOOK_PROXY_URL=https://domaci-knihovna-proxy.vase-jmeno.workers.dev
   ```

