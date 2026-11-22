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
