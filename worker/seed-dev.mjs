// Vývojová data pro lokální D1: testovací účet, pár autorů, významy a hlasy.
// Jen pro `wrangler dev` (DEV=1 v .dev.vars), do produkce nikdy.
//
//   node worker/seed-dev.mjs          # z kořene repa; spustitelné opakovaně
//
// Opakované spuštění vrátí dev data do výchozího stavu — smaže i významy,
// které testovací účty mezitím přidaly (všechno s user_id dev-…).
// Přihlášení: http://localhost:8787/api/dev/login (nebo ?kdo=Terka), případně
// běžně e-mailem tester@20slov.test — kód se vypíše do terminálu wrangleru.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { defTextError } from './src/validate.js';

const root = new URL('..', import.meta.url).pathname;
const devVars = (() => {
    try { return readFileSync(join(root, '.dev.vars'), 'utf8'); } catch { return ''; }
})();
const pepper = (devVars.match(/^HASH_PEPPER=(.*)$/m) || [])[1] || 'no-pepper';
const emailHash = (email) => createHash('sha256').update(email + pepper).digest('hex');

// Pool slov stejně jako test.mjs — Lehká obtížnost = z 3000 nejčastějších do 5 písmen.
const ctx = { o: null, atob, TextEncoder, TextDecoder };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'public/words.js'), 'utf8') + '\n;o = PRACTICE_WORDS;', ctx);
const LETTER = /[a-záčďéěíňóřšťúůýž]/;
const easy = ctx.o.slice(0, 3000).filter(w => [...w].filter(c => LETTER.test(c)).length <= 5);

// Avatar = kód z public/avatar.js; Ondra bez něj, ať je vidět i iniciála.
const AVATARS = { Tester: '23-7-2-15', Terka: '29-5-2-0', Kuba: '3-2-5-1', Bára: '8-6-11-9', Míša: '9-1-3-10' };
const USERS = ['Tester', 'Terka', 'Kuba', 'Bára', 'Ondra', 'Míša'].map(handle => ({
    id: `dev-user-${handle.toLowerCase()}`,
    handle,
    avatar: AVATARS[handle] || null,
    email: `${handle.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@20slov.test`,
}));
const uid = (h) => `dev-user-${h.toLowerCase()}`;

// Ručně psané významy [slovo, autor, text]. Tester má pár vlastních (úprava,
// „Moje významy“) a u několika slov jsou víc verzí (řazení podle hlasů).
const REAL = [
    ['den', 'Terka', 'Doba od rána do večera, kdy je světlo. Taky celých 24 hodin, třeba „za dva dny“.'],
    ['den', 'Kuba', 'Jeden ze sedmi v týdnu. V téhle hře má každý den svých 20 slov.'],
    ['den', 'Bára', 'Světlá část dne, kdy je slunce nad obzorem.'],
    ['den', 'Ondra', 'Časový úsek 24 hodin, za který se Země jednou otočí kolem své osy. Den má 1440 minut, 86 400 sekund a v kalendáři ho počítáme od půlnoci do půlnoci.'],
    ['život', 'Bára', 'Čas od narození do smrti. Taky to, co se kolem nás děje, když zrovna nehrajeme.'],
    ['místo', 'Ondra', 'Konkrétní bod nebo prostor, kde něco je nebo kde se dá sedět, stát či bydlet.'],
    ['práce', 'Míša', 'Činnost, za kterou se obvykle dostávají peníze. Nebo úsilí, které do něčeho vložíš.'],
    ['čas', 'Terka', 'To, co běží na hodinách — a v téhle hře ho máš na každé slovo jen 30 sekund.'],
    ['čas', 'Kuba', 'Veličina, kterou měříme trvání věcí — sekundy, minuty, hodiny.'],
    ['čas', 'Míša', 'Počasí venku, třeba „dneska je hezký čas". Hovorově.'],
    ['večer', 'Kuba', 'Část dne mezi odpolednem a nocí, kdy se stmívá.'],
    ['ráno', 'Bára', 'Začátek dne po probuzení, obvykle s kávou nebo čajem.'],
    ['věc', 'Ondra', 'Jakýkoli předmět, nebo záležitost, kterou je potřeba vyřešit.'],
    ['dítě', 'Míša', 'Malý člověk od narození zhruba do dospívání.'],
    ['jméno', 'Tester', 'Slovo, kterým někoho nebo něco oslovujeme a odlišujeme od ostatních.'],
    ['rok', 'Terka', 'Dvanáct měsíců, 365 dní — přesně tolik dní má denní výzva téhle hry.'],
    ['svět', 'Kuba', 'Celá Země se vším, co na ní je. Nebo prostředí, jako třeba svět hudby.'],
    ['noc', 'Bára', 'Tmavá část dne mezi večerem a ráno, kdy většina lidí spí.'],
    ['týden', 'Ondra', 'Sedm dní za sebou, od pondělí do neděle.'],
    ['auto', 'Míša', 'Motorové vozidlo na čtyřech kolech pro převoz lidí nebo věcí.'],
    ['auto', 'Tester', 'Zkratka pro automobil. Mluvíme o něm, když se jede nakoupit nebo na výlet.'],
    ['číslo', 'Terka', 'Znak nebo skupina znaků vyjadřující počet, pořadí nebo hodnotu.'],
    ['dům', 'Kuba', 'Stavba, ve které lidé bydlí nebo pracují.'],
    ['země', 'Bára', 'Planeta, na které žijeme. Taky půda pod nohama nebo stát, třeba Česká republika.'],
    ['pomoc', 'Ondra', 'Když někomu usnadníš práci nebo ho dostaneš z potíží.'],
    ['konec', 'Míša', 'Místo nebo chvíle, kde něco přestává — opak začátku.'],
    ['město', 'Terka', 'Velké sídlo s mnoha domy, ulicemi a obyvateli.'],
    ['otec', 'Kuba', 'Muž, který má dítě — táta.'],
    ['slovo', 'Tester', 'Nejmenší samostatná jednotka řeči, která něco znamená. Tady jich skládáš 20 denně.'],
    ['srdce', 'Bára', 'Sval v hrudi, který pumpuje krev. Obrazně i místo, kde sídlí city.'],
    ['tělo', 'Ondra', 'Celá fyzická podoba člověka nebo zvířete.'],
    ['film', 'Míša', 'Příběh natočený kamerou, který se promítá v kině nebo pouští doma.'],
    ['jídlo', 'Terka', 'Všechno, co se jí — a taky chvíle, kdy se u stolu sejdeme.'],
    ['cesta', 'Kuba', 'Pruh země, po kterém se chodí nebo jezdí. Taky samotné cestování.'],
    ['měsíc', 'Bára', 'Přirozená družice Země, která svítí v noci. Taky asi třicet dní v kalendáři.'],
    ['dveře', 'Ondra', 'Otvor ve zdi s křídlem, kterým se vchází do místnosti nebo domu.'],
    ['matka', 'Míša', 'Žena, která má dítě — máma.'],
    ['hra', 'Tester', 'Činnost pro zábavu podle pravidel. Třeba tahle, kde skládáš slova z písmen.'],
    ['hra', 'Terka', 'Divadelní představení nebo zápas, kde se o něco soupeří.'],
    ['loď', 'Kuba', 'Plavidlo, které převáží lidi nebo náklad po vodě.'],
    ['škola', 'Bára', 'Místo, kde se učí děti i dospělí.'],
    ['pokoj', 'Ondra', 'Místnost v bytě nebo domě. Taky klid, když tě nikdo neruší.'],
    ['láska', 'Míša', 'Silný cit náklonnosti k někomu nebo k něčemu.'],
    ['voda', 'Terka', 'Průhledná tekutina bez chuti, bez které se nedá žít.'],
    ['král', 'Kuba', 'Panovník v monarchii. V šachu nejdůležitější figura.'],
    ['sen', 'Bára', 'Obrazy a příběhy, které vidíme ve spánku. Taky přání, které si chceme splnit.'],
    ['pátek', 'Ondra', 'Poslední pracovní den v týdnu, po čtvrtku a před sobotou.'],
    ['byt', 'Míša', 'Obydlí v domě s více rodinami, obvykle s pokoji, kuchyní a koupelnou.'],
    ['hlas', 'Terka', 'Zvuk, který vydáváme při mluvení nebo zpěvu. Taky jeden hlas ve volbách.'],
    ['chyba', 'Kuba', 'Něco, co se udělalo špatně. V téhle hře třeba špatně složené slovo.'],
    ['zákon', 'Bára', 'Pravidlo, které platí pro všechny a které schválil parlament.'],
    ['boty', 'Ondra', 'Obuv, kterou nosíme na nohou venku.'],
];

// Zbytek Lehké: zhruba 70 % slov dostane ukázkový význam, zbytek zůstane
// bez něj, ať je v mezihře vidět i výzva „Víš, co znamená…?“.
const TEMPLATES = [
    w => `Ukázkový význam slova „${w}“ pro vývoj.`,
    w => `Vývojový význam slova „${w}“ — schválně delší, ať je vidět, jak se text v kartě zalomí na víc řádků a jak pod ním sedí autor s hlasy.`,
    w => `„${w}“ – krátký testovací význam.`,
];
const authors = USERS.slice(1).map(u => u.handle);
const realWords = new Set(REAL.map(r => r[0]));
const defs = REAL.map(([word, author, text]) => ({ word, author, text }));
// Každé 29. slovo patří Testerovi — má jich pak ~30, ať jde vyzkoušet
// stránkování „Moje významy".
easy.forEach((word, i) => {
    if (realWords.has(word) || i % 10 >= 7) return;
    const author = i % 29 === 0 ? 'Tester' : authors[i % authors.length];
    defs.push({ word, author, text: TEMPLATES[i % TEMPLATES.length](word) });
});

// Stejná pravidla jako API — seed nesmí obsahovat nic, co by hra nepřijala.
for (const d of defs) {
    const err = defTextError(d.text);
    if (err) throw new Error(`Význam „${d.word}“ neprojde validací: ${err}`);
}

// client_id 'dev-seed': starší lokální D1 ho má NOT NULL (CREATE TABLE IF NOT
// EXISTS existující tabulku nezmění), nové schéma ho dovolí prázdný.
// Hlasy: deterministicky 0–5 od ostatních účtů (ne od autora), Tester hlasuje
// jen občas, ať jde hlas přidat i odebrat.
const q = (v) => v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const now = Date.now();
const sql = [
    "DELETE FROM votes WHERE definition_id LIKE 'dev-%' OR client_id LIKE 'dev-%';",
    "DELETE FROM definitions WHERE id LIKE 'dev-%' OR user_id LIKE 'dev-%';",
    "DELETE FROM profile_days WHERE user_id LIKE 'dev-%';",
    "DELETE FROM training_days WHERE user_id LIKE 'dev-%';",
    "DELETE FROM users WHERE id LIKE 'dev-%';",
];
for (const u of USERS) {
    sql.push(`INSERT INTO users (id, email_hash, handle, handle_lc, client_id, created_at, avatar) VALUES (${q(u.id)}, ${q(emailHash(u.email))}, ${q(u.handle)}, ${q(u.handle.toLowerCase())}, NULL, ${now}, ${q(u.avatar)});`);
}
let voteCount = 0;
defs.forEach((d, i) => {
    const id = `dev-def-${i}`;
    const voters = USERS.filter(u => u.handle !== d.author && (u.handle !== 'Tester' || i % 4 === 0));
    const k = (i * 7 + d.word.length) % Math.min(6, voters.length + 1);
    sql.push(`INSERT INTO definitions (id, word, text, client_id, user_id, author, votes, created_at) VALUES (${q(id)}, ${q(d.word)}, ${q(d.text)}, 'dev-seed', ${q(uid(d.author))}, ${q(d.author)}, ${k}, ${now - i * 60000});`);
    voters.slice(0, k).forEach(v => {
        sql.push(`INSERT INTO votes (definition_id, client_id, created_at) VALUES (${q(id)}, ${q(v.id)}, ${now});`);
        voteCount++;
    });
});
// Pár odehraných dní, ať má Tester co ukázat na veřejném profilu /u/Tester.
const EPOCH = Date.UTC(2026, 8, 21);   // stejné jako v game.js
for (let i = 1; i <= 12; i++) {
    const playedOn = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const dayIdx = ((Math.floor((Date.parse(playedOn) - EPOCH) / 86400000) % 365) + 365) % 365;
    sql.push(`INSERT INTO profile_days (user_id, played_on, day_idx, score, created_at) VALUES ('dev-user-tester', ${q(playedOn)}, ${dayIdx}, ${[20, 18, 15, 20, 19, 12][i % 6]}, ${now});`);
    // trénink jen občas a jednou přes denní strop bodů
    if (i % 3 === 0) sql.push(`INSERT INTO training_days (user_id, played_on, words) VALUES ('dev-user-tester', ${q(playedOn)}, ${[4, 25, 8, 12][i / 3 - 1]});`);
}

const file = join(tmpdir(), 'slov2000-seed-dev.sql');
writeFileSync(file, sql.join('\n') + '\n');
const wrangler = (args) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'slov2000', '--local', ...args], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
wrangler([`--file=${join(root, 'worker/schema.sql')}`]);
wrangler([`--file=${file}`]);

console.log(`Hotovo: ${USERS.length} účtů, ${defs.length} významů (${REAL.length} ručně psaných), ${voteCount} hlasů.`);
console.log(`Lehká obtížnost: význam má ${new Set(defs.map(d => d.word)).size} z ${easy.length} slov. Tester má ${defs.filter(d => d.author === 'Tester').length} vlastních.`);
console.log('\nSpusť hru:   npx wrangler dev --port 8787        (z telefonu: --ip 0.0.0.0)');
console.log('Přihlášení:  http://localhost:8787/api/dev/login   (jiný účet: ?kdo=Terka)');
console.log(`E-mailem:    ${USERS[0].email} — kód se vypíše do terminálu wrangleru`);
if (!/^DEV=1$/m.test(devVars)) console.log('\n⚠️  Do .dev.vars přidej řádek DEV=1, jinak přihlášení lokálně neběží.');
