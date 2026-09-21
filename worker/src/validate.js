// Čistá validace významů — schválně mimo index.js: Cloudflare kontroluje každý
// pojmenovaný export vstupního modulu jako handler, takže `export const DEF_MAX`
// tam runtime shodí ("not of type 'function or ExportedHandler'").
// Díky vlastnímu modulu jde totéž importovat z workeru i z test.mjs.

export const DEF_MIN = 10;
export const DEF_MAX = 200;
export const AUTHOR_MAX = 20;

// Stejný seznam jako tools/build_words.py — ať neprojde sprostota ani do významů.
export const VULGAR = /(kurv|prdel|hovn|hajzl|píč|čur|čůr|mrd|šuká|šulin|zkurv|sračk|chcank|kokot|debil|zmrd|buzer|sviň|prcá|kunda|kundič)/i;

export const clean = (t) =>
    String(t).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

export function validClient(id) {
    return typeof id === 'string' && id.length >= 8 && id.length <= 64;
}

// Vrací chybovou hlášku, nebo null když je text v pořádku.
export function defTextError(text) {
    if (typeof text !== 'string') return 'chybí text';
    const t = clean(text);
    if (t.length < DEF_MIN) return `Napiš aspoň ${DEF_MIN} znaků.`;
    if (t.length > DEF_MAX) return `Nejvýš ${DEF_MAX} znaků.`;
    if (VULGAR.test(t)) return 'Bez sprostých slov, prosím.';
    if (/https?:\/\//i.test(t)) return 'Odkazy sem nepatří.';
    return null;
}
