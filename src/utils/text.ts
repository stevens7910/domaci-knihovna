/**
 * Odstraní diakritiku a převede text na malá písmena pro přirozené české vyhledávání.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const HTML_ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&hellip;': '…',
  '&ldquo;': '„',
  '&rdquo;': '“',
  '&lsquo;': '‚',
  '&rsquo;': '‘',
};

/**
 * Bezpečně vyčistí HTML popis knihy (např. z Google Books nebo Open Library) na čistý čitelný text:
 * - převede <br>, </p>, </div>, </li> na zalomení řádků,
 * - odstraní ostatní HTML tagy,
 * - dekóduje základní i číselné HTML entity,
 * - sjednotí přebytečné mezery a prázdné řádky.
 */
export function cleanBookDescription(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw
    // Odřádkování pro blokové a zalamovací HTML tagy
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(?:p|div|section|article|blockquote|h[1-6])\s*>/gi, '\n\n')
    .replace(/<\s*li\b[^>]*>/gi, '• ')
    .replace(/<\/\s*li\s*>/gi, '\n')
    // Odstranění všech ostatních HTML tagů
    .replace(/<[^>]+>/g, '');

  // Dekódování pojmenovaných HTML entit
  text = text.replace(
    /&(?:quot|apos|#39|amp|lt|gt|nbsp|ndash|mdash|hellip|ldquo|rdquo|lsquo|rsquo);/gi,
    (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity
  );

  // Dekódování dekadických (&#123;) a hexadecimálních (&#x7B;) entit
  text = text
    .replace(/&#(\d+);/g, (_, code: string) => {
      const num = Number.parseInt(code, 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const num = Number.parseInt(hex, 16);
      return Number.isFinite(num) ? String.fromCodePoint(num) : '';
    });

  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
