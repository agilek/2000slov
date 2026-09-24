// Jediná spustitelná kontrola projektu:  node test.mjs
// Bez frameworku, jen assert. Hlídá místa, kde tichá chyba nejvíc bolí:
// vývojové přihlášení, validaci významů, neporušitelné vlastnosti slovníku
// a úplnost přesmyček.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { clean, defTextError, validClient, DEF_MIN, DEF_MAX } from './worker/src/validate.js';
import { authEnabled, devLogin } from './worker/src/auth.js';
import { points, profilePage } from './worker/src/profile.js';
import { DatabaseSync } from 'node:sqlite';
import Avatar from './public/avatar.js';
import Achievements from './public/achievements.js';
import { stamp } from './tools/stamp.mjs';

// words.js se spouští ve vm, takže pole z něj mají prototyp z jiného realmu
// a deepStrictEqual by je odmítl. Proto se porovnává jen obsah.
const prazdne = (pole, popis) =>
    assert.equal(pole.length, 0, `${popis}: ${[...pole].slice(0, 5).join(', ')}`);

let passed = 0;
const test = (name, fn) => {
    try { fn(); passed++; }
    catch (e) { console.error(`✘ ${name}\n  ${e.message}`); process.exitCode = 1; }
};

/* ---------------- vývojové přihlášení (worker) ---------------- */

// /api/dev/login obchází e-mail — nesmí existovat mimo DEV=1 ani z veřejné
// adresy. Stráž je před prvním dotazem do DB; prázdná DB pak ukáže, že prošla.
const emptyDb = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) };
const devError = async (env, host) => (await devLogin(null, { DB: emptyDb, ...env },
    new URL(`http://${host}/api/dev/login`), null, (o) => o)).error;
const [prodLocal, devPublic, devLan] = await Promise.all([
    devError({}, 'localhost:8787'), devError({ DEV: '1' }, '20slov.cz'), devError({ DEV: '1' }, '192.168.1.5:8787')]);

test('dev přihlášení v produkci neexistuje', () => assert.equal(prodLocal, 'not found'));
test('dev přihlášení z veřejné adresy neexistuje', () => assert.equal(devPublic, 'not found'));
test('dev přihlášení z lokální sítě projde stráží', () => assert.match(devLan, /seed-dev/));
test('účty běží jen s poštou nebo ve vývoji', () => {
    assert.equal(authEnabled({}), false);
    assert.equal(authEnabled({ DEV: '1' }), true);
    assert.equal(authEnabled({ RESEND_KEY: 'k', MAIL_FROM: 'a@b.cz' }), true);
});

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

/* ---------------- body za aktivitu (worker) ---------------- */

// Body počítá jeden SQL dotaz, proto proti skutečnému SQLite ze schema.sql.
// Hlídá denní stropy, skryté významy a to, že se nepočítá cizí aktivita.
const sql = new DatabaseSync(':memory:');
sql.exec(readFileSync(new URL('./worker/schema.sql', import.meta.url), 'utf8'));
const run = (q, ...a) => sql.prepare(q).run(...a);
const DEN = 86400000;
for (const d of ['2026-09-01', '2026-09-02', '2026-09-03']) run('INSERT INTO profile_days VALUES (?, ?, 0, 0, 0)', 'ja', d);
run('INSERT INTO profile_days VALUES (?, ?, 0, 20, 0)', 'cizi', '2026-09-01');
run("INSERT INTO training_days VALUES ('ja', '2026-09-01', 25), ('ja', '2026-09-02', 4), ('cizi', '2026-09-01', 9)");
run("INSERT INTO definitions (id, word, text, user_id, votes, hidden, created_at) VALUES ('v1', 'a', 't', 'ja', 3, 0, 0), ('v2', 'b', 't', 'ja', 5, 1, 0)");
for (let i = 0; i < 14; i++) run('INSERT INTO votes VALUES (?, ?, ?)', `x${i}`, 'ja', i < 12 ? i : 2 * DEN);
run("INSERT INTO votes VALUES ('v1', 'cizi', 0)");
const d1 = { prepare: (q) => ({ bind: (...a) => ({ all: async () => ({ results: sql.prepare(q).all(...a) }) }) }) };
const [mojeBody, nikdo] = await Promise.all([points({ DB: d1 }, 'ja'), points({ DB: d1 }, 'nikdo')]);

test('body: denní stropy a skryté významy', () => assert.deepEqual({ ...mojeBody },
    { total: 3 * 10 + 14 + 5 + 3 * 2 + 12, dny: 3, slovTreninku: 14, vyznamu: 1, ziskanychHlasu: 3, maxHlasu: 3, nejlepsi: 0, danychHlasu: 12 }));
test('body: hráč bez aktivity má nulu', () => assert.equal(nikdo.total, 0));

/* ---------------- úspěchy ---------------- */

// Nejlepší výklad = význam nahoře u slova, a jen když porazil jiný.
run("INSERT INTO definitions (id, word, text, user_id, votes, hidden, created_at) VALUES ('w1', 'slon', 't', 'autor', 4, 0, 0), ('w2', 'slon', 't', 'cizi', 2, 0, 0), ('w3', 'sam', 't', 'autor', 9, 0, 0)");
const autor = await points({ DB: d1 }, 'autor');
test('úspěchy: nejlepší výklad a nejvíc hlasů na jednom významu', () =>
    assert.deepEqual([autor.nejlepsi, autor.maxHlasu], [1, 9]));
test('úspěchy: prahy a veřejný stav', () => {
    const st = Achievements.publicState({ dny: 7, nejdelsi: 7, perfektnich: 0 }, autor, true);
    const got = Achievements.LIST.filter(a => Achievements.done(a, st)).map(a => a.id);
    assert.deepEqual(got, ['prvni-kolo', 'nova-tvar', 'rozjezd', 'tyden', 'sto-slov', 'pisalek', 'palec', 'nejlepsi']);
});
// Veřejný profil: odznaky, které zná jen klient (tajné, sdílení), přijdou
// z user_achievements; ostatní server dopočítá sám (autor má význam = Pisálek).
run("INSERT INTO users (id, email_hash, handle, handle_lc, created_at) VALUES ('autor', 'h', 'Autor', 'autor', 0)");
run("INSERT INTO user_achievements VALUES ('autor', 'nocni-sova', 0), ('autor', 'chlouba', 0)");
const verejny = await (await profilePage(null, { DB: d1 }, new URL('https://x/u/Autor?cast=1'))).text();
test('úspěchy: veřejný profil ukáže i odznaky z klienta', () => {
    for (const jmeno of ['Noční sova', 'Chlouba', 'Pisálek']) assert.ok(verejny.includes(`ach-name">${jmeno}<`), jmeno);
    assert.ok(!verejny.includes('ach-name">Bleskovka<'));
});
test('úspěchy: unikátní id a každá ikona existuje', () => {
    assert.equal(new Set(Achievements.LIST.map(a => a.id)).size, Achievements.LIST.length);
    for (const a of Achievements.LIST) if (a.icon !== 'avatar') readFileSync(`public/designs/kostky/${a.icon}.svg`);
});

/* ---------------- avatar (hra i worker) ---------------- */

// Kód jde z localStorage i z POST /api/me/avatar rovnou do innerHTML —
// projít smí jen čtyři indexy v rozsahu polí.
test('avatar: každý tvar, barva, oči i pusa se vykreslí', () => {
    const [ns, nc, ne, nm] = Avatar.counts;
    assert.ok(ns >= 30 && ne >= 15 && nm >= 15, `málo variant: ${Avatar.counts}`);
    for (let i = 0; i < Math.max(ns, nc, ne, nm); i++) {
        const svg = Avatar.svg(`${i % ns}-${i % nc}-${i % ne}-${i % nm}`);
        assert.match(svg, /^<svg[^>]*>.*<\/svg>$/s);
        assert.doesNotMatch(svg, /undefined|NaN/);
    }
});
test('avatar: náhodný kód je vždy platný', () => {
    for (let i = 0; i < 500; i++) assert.ok(Avatar.valid(Avatar.random()));
});
test('avatar: cizí kód neprojde', () => {
    const [ns] = Avatar.counts;
    for (const bad of [`${ns}-0-0-0`, '0-0-0', '0-0-0-0-0', '0-0-0-0"><script>', '', null, '-1-0-0-0'])
        assert.equal(Avatar.svg(bad), '', String(bad));
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

test('denní výzva je přesně prvních 7300 slov poolu', () => {
    // Na tom stojí popisek obtížnosti tréninku „Střední = stejně jako v denní výzvě".
    const top = new Set(PRACTICE_WORDS.slice(0, WORDS.length));
    prazdne(WORDS.filter(w => !top.has(w)), 'mimo prvních 7300');
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

/* ---------------- verze statiky ---------------- */

// ?v= v index.html a CACHE/SHELL v sw.js jsou otisky obsahu. Kdo změní CSS
// nebo JS a zapomene na `node tools/stamp.mjs`, vracející se hráč dostane
// ze service workeru starou verzi.
test('statika je orazítkovaná (node tools/stamp.mjs)', () => {
    const { html, sw } = stamp();
    assert.ok(html === readFileSync('public/index.html', 'utf8'), 'index.html má staré ?v=');
    assert.ok(sw === readFileSync('public/sw.js', 'utf8'), 'sw.js má starý SHELL nebo CACHE');
});

console.log(`${passed} kontrol prošlo${process.exitCode ? ' (a něco spadlo)' : ''}`);
