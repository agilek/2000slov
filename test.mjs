// Jediná spustitelná kontrola projektu:  node test.mjs
// Bez frameworku, jen assert. Hlídá tři místa, kde tichá chyba nejvíc bolí:
// validaci významů, neporušitelné vlastnosti slovníku a úplnost přesmyček.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { clean, defTextError, validClient, DEF_MIN, DEF_MAX } from './worker/src/validate.js';

// words.js se spouští ve vm, takže pole z něj mají prototyp z jiného realmu
// a deepStrictEqual by je odmítl. Proto se porovnává jen obsah.
const prazdne = (pole, popis) =>
    assert.equal(pole.length, 0, `${popis}: ${[...pole].slice(0, 5).join(', ')}`);

let passed = 0;
const test = (name, fn) => {
    try { fn(); passed++; }
    catch (e) { console.error(`✘ ${name}\n  ${e.message}`); process.exitCode = 1; }
};

/* ---------------- validace významů (worker) ---------------- */

test('krátký text neprojde', () =>
    assert.match(defTextError('krátké'), /aspoň/));

test('text na hranici délky projde', () =>
    assert.equal(defTextError('a'.repeat(DEF_MIN)), null));

test('dlouhý text neprojde', () =>
    assert.match(defTextError('a'.repeat(DEF_MAX + 1)), /Nejvýš/));

test('text přesně na horní hranici projde', () =>
    assert.equal(defTextError('a'.repeat(DEF_MAX)), null));

test('běžný význam projde', () =>
    assert.equal(defTextError('Dopravní prostředek na dvou kolech.'), null));

test('sprosté slovo neprojde', () =>
    assert.match(defTextError('tohle je nejaka kurva dlouha veta'), /sprost/));

test('odkaz neprojde', () =>
    assert.match(defTextError('Podívej se na https://example.com a uvidíš'), /Odkazy/));

test('bílé znaky se slučují a ořezávají', () =>
    assert.equal(clean('  a\t\tb\n\nc  '), 'a b c'));

test('řídicí znaky se nepočítají jako délka', () =>
    assert.match(defTextError('ab\u0000\u0001cd'), /aspoň/));

test('clientId musí mít rozumnou délku', () => {
    assert.equal(validClient('x'.repeat(8)), true);
    assert.equal(validClient('x'.repeat(64)), true);
    assert.equal(validClient('x'.repeat(7)), false);
    assert.equal(validClient('x'.repeat(65)), false);
    assert.equal(validClient(null), false);
});

/* ---------------- slovník ---------------- */

// vm je vlastní realm — web globály (atob, TextDecoder) v něm nejsou, dekodér
// slov je ale potřebuje. Prototypy polí odtud jsou cizí, proto se níž porovnává
// jen obsah.
const ctx = { o: null, atob, TextEncoder, TextDecoder };
vm.createContext(ctx);
vm.runInContext(
    readFileSync(new URL('./public/words.js', import.meta.url), 'utf8') +
    '\n;o = { PACKED, unpackDay, PRACTICE_WORDS, ALTS };', ctx);
const { PACKED, unpackDay, PRACTICE_WORDS, ALTS } = ctx.o;
// Rozbalené denní pořadí. Zároveň nejpřísnější kontrola šifry: kontroly níž
// (podmnožina poolu, jedno slovo z každého pásma) spadnou při jediném rozjetém
// bitu mezi pack_day v Pythonu a unpackDay v JS.
const WORDS = Array.from({ length: PACKED.length }, (_, i) => unpackDay(i)).flat();

const PER_DAY = 20;
const DAYS = 365;

test('denní výzva má přesně rok slov', () =>
    assert.equal(WORDS.length, DAYS * PER_DAY));

test('denní slova nejsou ve zdrojáku čitelná', () => {
    const src = readFileSync(new URL('./public/words.js', import.meta.url), 'utf8');
    const den = unpackDay(0);
    assert.equal(src.includes('const WORDS'), false);
    // slovo z dne 1 se v souboru smí objevit leda v tréninkovém poolu,
    // ne na místě, kde by šlo přečíst, ke kterému dni patří.
    assert.equal(src.includes(den.join('","')), false);
});

test('tréninkový pool má 15 000 slov', () =>
    assert.equal(PRACTICE_WORDS.length, 15000));

test('žádné slovo se neopakuje', () => {
    assert.equal(new Set(WORDS).size, WORDS.length);
    assert.equal(new Set(PRACTICE_WORDS).size, PRACTICE_WORDS.length);
});

test('denní slova jsou podmnožinou poolu', () => {
    const pool = new Set(PRACTICE_WORDS);
    prazdne(WORDS.filter(w => !pool.has(w)), 'mimo pool');
});

test('každý den má právě jedno slovo z každého frekvenčního pásma', () => {
    // Pásma se počítají z pořadí v poolu; pool je seřazený podle frekvence.
    const rank = new Map(PRACTICE_WORDS.map((w, i) => [w, i]));
    const daily = [...WORDS].sort((a, b) => rank.get(a) - rank.get(b));
    const band = new Map(daily.map((w, i) => [w, Math.floor(i / DAYS)]));
    for (let d = 0; d < DAYS; d++) {
        const den = WORDS.slice(d * PER_DAY, (d + 1) * PER_DAY);
        assert.equal(new Set(den.map(w => band.get(w))).size, PER_DAY,
            `den ${d + 1} nemá slovo z každého pásma`);
    }
});

/* ---------------- přesmyčky ---------------- */

const klic = w => [...w].sort().join('');
const skupiny = new Map();
for (const w of PRACTICE_WORDS) {
    const k = klic(w);
    if (!skupiny.has(k)) skupiny.set(k, []);
    skupiny.get(k).push(w);
}

test('každá přesmyčka uvnitř poolu je v ALTS', () => {
    const chybi = [];
    for (const ws of skupiny.values()) {
        if (ws.length < 2) continue;
        for (const w of ws) {
            const ma = new Set(ALTS[w] || []);
            for (const jine of ws) if (jine !== w && !ma.has(jine)) chybi.push(`${w}→${jine}`);
        }
    }
    prazdne(chybi, 'chybějící vazby');
});

test('ruční kurace zůstala zachovaná', () => {
    assert.ok((ALTS['otec'] || []).includes('ocet'));
    assert.ok((ALTS['otec'] || []).includes('otce'));   // i tvar mimo pool
    assert.ok((ALTS['rok'] || []).includes('okr'));
});

test('alternativa je vždy ze stejných písmen', () => {
    for (const [slovo, alts] of Object.entries(ALTS)) {
        for (const a of alts) {
            assert.equal(klic(a), klic(slovo), `${slovo} ↔ ${a} nejsou přesmyčky`);
        }
    }
});

console.log(`${passed} kontrol prošlo${process.exitCode ? ' (a něco spadlo)' : ''}`);
