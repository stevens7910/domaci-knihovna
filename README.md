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

## Nasazení na produkční HTTPS hosting (Vercel – doporučeno)

Přístup ke kameře (`getUserMedia`) i instalace PWA (Service Worker) vyžadují v produkci **HTTPS** (kromě `localhost`). Projekt je připravený přímo pro **Vercel**, kde PWA i vestavěná serverless proxy pro české katalogy (`api/proxy.ts`) běží na jedné doméně bez nutnosti konfigurovat externí CORS proxy:

1. Importujte repozitář `stevens7910/domaci-knihovna` na [vercel.com](https://vercel.com/).
2. Vercel automaticky rozpozná **Vite** (`npm run build`, výstupní složka `dist`) a nasadí serverless funkci [api/proxy.ts](api/proxy.ts) na endpoint `/api/proxy`.
3. Aplikace automaticky posílá dotazy na **NK ČR** a **Obálky knih** přes `/api/proxy?url=…` (a stejně funguje i lokálně při `npm run dev` díky integrovanému Vite dev middleware).
4. Volitelně lze výchozí `/api/proxy` přepsat proměnnou prostředí `VITE_BOOK_PROXY_URL` (např. při použití [proxy/cloudflare-worker.js](proxy/cloudflare-worker.js)).

