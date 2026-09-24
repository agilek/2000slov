/* 20 slov — česká denní slovní hra po vzoru 18words.com
 * Denní výzva: která slova se hrají, určuje DATUM, ne postup hráče — všichni
 * tak mají v daný den stejných 20 slov a výsledky jsou porovnatelné.
 * Slovník: jen podstatná jména (Wikislovník). Každý den má jedno slovo
 * z každého z 20 frekvenčních pásem, takže dny mají srovnatelnou obtížnost.
 * Slož slovo ze všech písmen do 30 s. Jeden pokus denně; zítra přijde další
 * den bez ohledu na dnešní výsledek (nestihnuté slovo jen přetrhne sérii).
 * Trénink čerpá z širšího poolu PRACTICE_WORDS (15 000 slov), denní výzva
 * má 7300 slov / 365 dní a v words.js je zamíchaná — rozbaluje ji unpackDay. */
'use strict';

const START_TIME = 30;
// s — za jak dlouho po slově v tréninku naběhne další samo; po chybě déle,
// je co si přečíst. Klepnutím kamkoli jde hned.
const PRACTICE_GAP = { solved: 3, missed: 6 };
const WORDS_PER_DAY = 20;
const TOTAL_WORDS = PACKED.length * WORDS_PER_DAY; // 7300
const TOTAL_LEVELS = TOTAL_WORDS / WORDS_PER_DAY; // 365
// Den 1 denní výzvy. Číslo dne se počítá od tohoto data, takže každý hráč
// dostane v daný kalendářní den stejných 20 slov. Po 365 dnech se rok opakuje.
const EPOCH = Date.UTC(2026, 8, 21);

const LETTER_RE = /[a-záčďéěíňóřšťúůýž]/;
// hratelná písmena hesla (bez mezer, teček, pomlček — ty jsou ve slotech pevně)
const lettersOf = w => [...w].filter(c => LETTER_RE.test(c)).join('');
const fmtNum = n => n.toLocaleString('cs-CZ');
const STORAGE_KEY = 'slov2000_v2';
// Použije se jen při otevření z file:// nebo localhostu; po navázání
// vlastní domény sem patří ona.
const FALLBACK_URL = 'https://slov2000.slov2000.workers.dev/';

// Backend běží na stejné doméně jako hra (jeden Worker servíruje statiku
// i /api/*, viz wrangler.toml), takže stačí relativní cesty — žádné CORS.
const API_BASE = '';
const API_TIMEOUT_MS = 1500;

// VAPID veřejný klíč pro Web Push denní připomínku (worker/README.md → sekce
// "Denní připomínka"). Prázdný = nabídka notifikací se nezobrazí.
const VAPID_PUBLIC_KEY = 'BIfOSyPsUDTwcGscDllPUF7bWF7iAMqJnMgwxlrDmUu0l3nQ_AySykBXvM_qzWk5v6HDzfvC57PYM0PHk7jRqbU';

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const IS_DESKTOP = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const IS_STANDALONE = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

/* ---------------- trvalý stav ---------------- */

function defaultPersist() {
    return {
        results: {},         // { [index dne]: počet získaných slov } — odehrané dny
        streak: 0,
        bestStreak: 0,
        lastWinDate: null,
        attempts: 0,
        wins: 0,
        kbHintShown: false,
        practiceWords: 0,   // uhodnutá slova v tréninku, opakovaná se počítají znovu
        practiceSeen: '',   // která různá slova už v tréninku padla (bitmapa, viz markPracticeSeen)
        practiceLevel: 'stredni', // obtížnost tréninku, klíč z PRACTICE_LEVELS
        nick: '',           // přezdívka u přidaných významů
        pendingLogin: null, // { id, expiresAt } — rozjetá žádost o přihlášení
        nudgedAt: 0,        // série, u které jsme naposled připomněli účet
        day: null,           // { date, dayIdx, wordIdx, marks, time, done, perfect, realTopPct }
        clientId: genClientId(), // anonymní ID pro leaderboard backend (jen počítadlo, žádná osobní data)
        a2hsPromptDismissed: false, // "přidej na plochu" nabídka na iOS se ukáže jen do prvního zavření
    };
}

function genClientId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let persist = loadPersist();

function loadPersist() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const p = Object.assign(defaultPersist(), JSON.parse(raw));
            // uložený den ze staré, postupové verze nemá index dne — zahodit
            if (p.day && typeof p.day.dayIdx !== 'number') p.day = null;
            return p;
        }
    } catch (e) {}
    return defaultPersist();
}

function savePersist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persist)); } catch (e) {}
}

function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Index dne = počet dní od EPOCH, po roce se cyklí dokola. Počítá se z data
// v místní půlnoci, takže se den láme tam, kde hráč skutečně žije.
function dayIndex(dateStr) {
    const [y, m, d] = (dateStr || todayStr()).split('-').map(Number);
    const days = Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
    return ((days % TOTAL_LEVELS) + TOTAL_LEVELS) % TOTAL_LEVELS;
}

function playedDays() { return Object.keys(persist.results).length; }

function uncoveredCount() { return Math.min(playedDays() * WORDS_PER_DAY, TOTAL_WORDS); }

// Slova se rozbalují až na vyžádání — celý rok v jednom poli by stačilo
// vypsat v konzoli a zamíchání v words.js by bylo k ničemu.
function dayWords(idx) { return unpackDay(idx); }

function siteUrl() {
    if (location.protocol.startsWith('http') && !location.hostname.includes('localhost')) {
        return location.origin + location.pathname;
    }
    return FALLBACK_URL;
}

/* ---------------- herní stav (runtime) ---------------- */

let state = {
    mode: 'daily', words: [], wordIdx: 0, marks: [], solved: 0,
    time: START_TIME, letters: [], selected: [], timer: null,
    processing: false, incorrectTimeout: null, shuffledThisWord: false,
    practiceCount: 0,
    // každé nové kolo dostane číslo; naplánované callbacky ze starého kola
    // (odhalení slova, odpočet) se podle něj poznají a zahodí
    gen: 0,
};
let countdownInterval = null;

/* ---------------- haptika ---------------- */

// Vibrační vzory (ms): číslo = jedna vibrace, pole = vibrace/pauza/vibrace…
// Na zařízeních bez podpory (iOS, desktop) se tiše nic nestane.
const HAPTIC_PATTERNS = {
    tap: 10,                          // výběr/odebrání písmene, zamíchání
    button: 15,                       // klik na tlačítko
    success: [15, 50, 30],            // správně složené slovo
    error: [45, 40, 45],              // špatné slovo
    miss: [60, 50, 60, 50, 100],      // nestihnuté slovo
    win: [20, 40, 20, 40, 20, 40, 80],// perfektní den (konfety)
    tick: 8,                          // poslední vteřiny časovače
};

const COARSE_POINTER = window.matchMedia('(pointer: coarse)').matches;

// iOS Vibration API nemá, ale přepnutí <input type="checkbox" switch>
// (Safari 17.4+) vydá nativní haptické ťuknutí. Programově ale funguje jen
// klik na obalující <label> — přímý klik na input haptiku nespustí.
// Apple to v iOS 26.5 zalepil, proto níže ještě překryvné přepínače.
function iosTap() {
    if (!COARSE_POINTER) return;
    try {
        const label = document.createElement('label');
        label.ariaHidden = 'true';
        label.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        label.appendChild(input);
        document.head.appendChild(label);
        label.click();
        document.head.removeChild(label);
    } catch (e) {}
}

function haptic(kind) {
    const pattern = HAPTIC_PATTERNS[kind] || HAPTIC_PATTERNS.tap;
    if ('vibrate' in navigator) {
        try { navigator.vibrate(pattern); } catch (e) {}
        return;
    }
    // iOS: ťuknutí neumí délku ani sílu — vzor převedeme na jedno ťuknutí
    // za každý vibrační úsek, s rozestupem aspoň 120 ms, ať jdou rozeznat.
    const segs = Array.isArray(pattern) ? pattern : [pattern];
    let t = 0;
    for (let i = 0; i < segs.length; i += 2) {
        if (t === 0) iosTap();
        else setTimeout(iosTap, t);
        t += Math.max(segs[i] + (segs[i + 1] || 0), 120);
    }
}

// Skutečný, neviditelný přepínač přes celé tlačítko: dotyk ho přepne a iOS
// vydá haptiku nativně — funguje i na iOS 26.5+, kde programový trik nejde.
// Klik dál probublá na tlačítko, takže onclick funguje beze změny.
function addHapticOverlays() {
    if ('vibrate' in navigator || !COARSE_POINTER) return;
    $$('button:not([type="submit"])').forEach(el => {
        const sw = document.createElement('input');
        sw.type = 'checkbox';
        sw.setAttribute('switch', '');
        sw.setAttribute('aria-hidden', 'true');
        sw.tabIndex = -1;
        sw.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.appendChild(sw);
    });
}

// Lehké ťuknutí při kliku na tlačítko. Na iOS mají skutečná tlačítka
// překryvný přepínač (nativní haptika), programově ťukáme jen na prvky
// s role="button", které překrýt nejdou.
document.addEventListener('pointerdown', e => {
    const btn = e.target.closest('button, [role="button"]');
    if (!btn) return;
    if ('vibrate' in navigator || !btn.matches('button')) haptic('button');
});

/* ---------------- zvuky ---------------- */

// Tóny generované přes Web Audio API (žádné soubory ke stažení). AudioContext
// se vytváří líně a probouzí při prvním doteku, aby to prošlo přes autoplay
// omezení prohlížečů.
let audioCtx = null;
function getAudioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function playTone(freq, dur, type, peak, delay) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
}

// Stoupající tón s každým dalším vybraným písmenem (á la Duolingo).
const LETTER_NOTES = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50, 1174.66, 1318.51];
function playLetterSound(count) {
    playTone(LETTER_NOTES[Math.min(count - 1, LETTER_NOTES.length - 1)], 0.14, 'sine', 0.16);
}
function playRemoveSound() { playTone(392.00, 0.10, 'sine', 0.11); }
function playSuccessSound() {
    playTone(659.25, 0.11, 'sine', 0.2, 0);
    playTone(783.99, 0.11, 'sine', 0.2, 0.09);
    playTone(1046.50, 0.2, 'sine', 0.22, 0.18);
}
function playErrorSound() { playTone(196.00, 0.22, 'sawtooth', 0.11, 0); }
function playMissSound() { playTone(174.61, 0.35, 'sawtooth', 0.1, 0); }
function playWinSound() {
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => playTone(f, 0.2, 'sine', 0.2, i * 0.11));
}

/* ---------------- UI helpery ---------------- */

let toastTimeout = null;
function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => t.classList.remove('show'), 2600);
}

function showScreen(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}

/* ---------------- welcome ---------------- */

function renderWelcomeGrid() {
    const el = $('welcomeGrid');
    el.innerHTML = '';
    const todayDone = persist.day && persist.day.done && persist.day.date === todayStr();
    for (let i = 0; i < WORDS_PER_DAY; i++) {
        const c = document.createElement('div');
        c.className = 'pg-cell';
        if (todayDone && persist.day.marks[i] !== undefined) {
            c.classList.add(persist.day.marks[i] ? 'solved' : 'missed');
        }
        el.appendChild(c);
    }
}

function showWelcome() {
    stopConfetti();
    placeGameGrid('game');
    renderWelcomeGrid();
    const todayDone = persist.day && persist.day.done && persist.day.date === todayStr();
    $('playBtnLabel').textContent = todayDone ? 'Výsledek' : 'Hrát';
    $('welcomeRules').innerHTML = persist.attempts > 0
        ? 'Všech 20 slov udrží sérii. Dnešních 20 slov hraje dnes každý stejných.'
        : `Dnešních 20 slov z ${fmtNum(TOTAL_WORDS)} nejčastějších českých hraje dnes každý stejných. Zvládneš všechna?`;
    showScreen('welcome');
}

/* ---------------- významy slov ---------------- */

const defCache = new Map();      // slovo -> definice | null (null = víme, že žádná není)
const defInflight = new Map();

async function apiGet(path) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
        const res = await fetch(path, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok ? await res.json() : null;
    } catch (e) {
        return null; // offline nebo timeout — hra jede dál, jen bez významu
    }
}

async function apiPost(path, body) {
    try {
        const res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ clientId: persist.clientId }, body)),
        });
        return { ok: res.ok, data: await res.json().catch(() => null) };
    } catch (e) {
        return { ok: false, data: null };
    }
}

const defsUrl = (words) => `/api/defs?w=${encodeURIComponent(words)}`;

// Fronta tréninku se bere od konce, takže dalších pár slov známe dopředu
// a mezihra pak nikdy nečeká na síť.
function prefetchDefs() {
    if (state.mode !== 'practice') return;
    const todo = (state.practiceQueue || []).slice(-10)
        .filter(w => !defCache.has(w) && !defInflight.has(w));
    if (!todo.length) return;
    todo.forEach(w => defInflight.set(w, true));
    apiGet(defsUrl(todo.join(','))).then(data => {
        if (data && data.defs) {
            for (const w of Object.keys(data.defs)) defCache.set(w, data.defs[w]);
        }
    }).finally(() => todo.forEach(w => defInflight.delete(w)));
}

/* ---------------- mezihra po slově (jen trénink) ---------------- */

// Panel zdola jako Duolingo po odpovědi: zelený po uhodnutí, červený po
// vypršení času, hra nad ním zůstává vidět. Další slovo naběhne samo (tlačítko
// se mezitím vyplňuje), klepnutím kamkoli mimo kartu hned. Sáhnutí na kartu
// s významem, otevření významů nebo odchod z aplikace odpočet zruší — kdo čte,
// tomu obrazovka neuteče.
// Hlášky po uhodnutí; krátké (≤ 12 znaků), vedle bývá štítek série.
const PRAISE = {
    fast:  ['Bleskovka!', 'Jako blesk!', 'Turbo!', 'Fofr!', 'Raketa!', 'Rychlík!'],   // do 5 s
    close: ['Tak tak!', 'O fous!', 'Na chlup!', 'Těsně!', 'Uf, těsně!', 'Na knap!'],   // zbývalo ≤ 10 s
    ok:    ['Paráda!', 'Výborně!', 'Super!', 'Skvělé!', 'Bomba!', 'Pecka!', 'Trefa!', 'Přesně tak!'],
};
// Náhodná hláška, ale nikdy stejná dvakrát po sobě.
function praise(kind) {
    const pool = PRAISE[kind].filter(p => p !== state.lastPraise);
    return (state.lastPraise = pool[Math.floor(Math.random() * pool.length)]);
}
const STREAK_MILESTONES = [5, 10, 20, 30, 50, 100];

function showWordDone(word, gen, solved) {
    if (state.gen !== gen) return;
    clearInterval(state.timer);
    clearTimeout(state.nextTimer);
    const ov = $('wordDoneOverlay');
    const elapsed = START_TIME - state.time;
    state.wdWord = word;
    ov.classList.remove('closing', 'solved', 'missed');
    ov.classList.add(solved ? 'solved' : 'missed');
    ov.querySelector('.wd-panel').style.cssText = '';
    $('wdTitle').textContent = !solved ? 'Čas vypršel'
        : praise(elapsed <= 5 ? 'fast' : state.time <= 10 ? 'close' : 'ok');
    // Čas do dalšího slova ukazuje tlačítko, podtitulek jen u chyby.
    $('wdSub').textContent = solved ? ''
        : state.lostStreak >= 2 ? 'Série skončila' : 'Hledané slovo';
    renderWdStreak(solved);
    renderWdTiles(word, solved);
    renderWdCard(word);
    const gap = PRACTICE_GAP[solved ? 'solved' : 'missed'];
    const next = $('wdNextBtn');
    next.style.setProperty('--gap', gap + 's');
    next.classList.remove('paused');
    next.classList.add('counting');
    ov.classList.add('active');
    state.wdPaused = false;
    state.wdDeadline = Date.now() + gap * 1000;
    state.nextTimer = setTimeout(nextWord, gap * 1000);
    if (!defCache.has(word)) {
        apiGet(defsUrl(word)).then(d => {
            if (!d || !d.defs) return;
            defCache.set(word, d.defs[word] || null);
            if (state.gen === gen && state.wdWord === word) renderWdCard(word);
        });
    }
    prefetchDefs();
}

// Série uhodnutých slov v tréninku; na milníku plamen vzplane (CSS) a zazní
// fanfára. Po chybě zhaslý plamen s přeškrtnutým číslem, jak to dělá Duolingo.
function renderWdStreak(solved) {
    const chip = $('wdStreak');
    const n = solved ? state.practiceCount : state.lostStreak;
    chip.className = 'wd-streak' + (solved ? '' : ' wd-streak--lost');
    chip.hidden = n < 2;
    if (n < 2) return;
    setEmojiText(chip, solved ? `🔥 ${n} v řadě` : `🔥 ${n}`);
    chip.setAttribute('aria-label', solved ? `${n} v řadě` : `Série ${n} skončila`);
    if (solved && STREAK_MILESTONES.includes(n)) {
        chip.classList.add('wd-streak--milestone');
        setTimeout(() => { playWinSound(); haptic('win'); }, 350);
    }
}

// Slovo jako kostky. Nestihnuté naskočí v rozsypaném pořadí, jak bylo ve hře,
// a přeskládá se do správného (posun --from, oblouček --hop řeší CSS).
function renderWdTiles(word, solved) {
    const box = $('wdTiles');
    const chars = [...word];
    const gap = 6;
    const avail = Math.min(window.innerWidth, 440) - 44;
    const size = Math.max(20, Math.min(44, Math.floor((avail - (chars.length - 1) * gap) / chars.length)));
    box.style.setProperty('--tile', size + 'px');
    box.setAttribute('aria-label', word);
    box.classList.remove('wd-unscramble');
    const tiles = chars.map((ch, i) => {
        const t = el('span', LETTER_RE.test(ch) ? 'wd-tile' : 'wd-tile wd-tile--gap', ch.trim());
        t.style.setProperty('--i', i);
        return t;
    });
    box.replaceChildren(...tiles);
    if (solved) return;
    const bank = [...$$('#letterRow .letter')].map(l => state.letters[+l.dataset.index]);
    const slots = chars.map((_, i) => i).filter(i => LETTER_RE.test(chars[i]));
    const used = new Set();
    slots.forEach(slot => {
        const k = bank.findIndex((c, j) => !used.has(j) && c === chars[slot]);
        if (k < 0) return;
        used.add(k);
        const dx = (slots[k] - slot) * (size + gap);
        tiles[slot].style.setProperty('--from', dx + 'px');
        tiles[slot].style.setProperty('--hop', dx ? '-16px' : '0px');
    });
    box.classList.add('wd-unscramble');
}

// Význam slova, nebo místo něj výzva, ať ho hráč doplní.
function renderWdCard(word) {
    const def = defCache.get(word);
    const card = $('wdCard');
    card.hidden = !def;
    card.replaceChildren();
    if (def) {
        const meta = el('div', 'wd-meta');
        meta.append(authorEl(def.author), voteBtn(def));
        card.append(el('p', 'wd-text', def.text), meta);   // cizí text vždy přes textContent
    }
    $('wdAddBtn').hidden = !!def;
    $('wdAddTitle').textContent = `Víš, co znamená „${word}“?`;
    $('wdMoreBtn').hidden = !def;
    $('wdMoreBtn').textContent = auth.enabled ? 'Významy a přidat vlastní' : 'Všechny významy';
}

function nextWord() {
    const ov = $('wordDoneOverlay');
    if (!ov.classList.contains('active') || ov.classList.contains('closing')) return;
    clearTimeout(state.nextTimer);
    state.nextTimer = null;
    hideWordDone(true);
    $('wordDisplay').style.cssText = '';
    loadWord();
}

// Odpočet se zruší, ne pozastaví: kdo klepl na význam, klepne na Další sám.
function holdWordDone() {
    if (!$('wordDoneOverlay').classList.contains('active')) return;
    clearTimeout(state.nextTimer);
    state.nextTimer = null;
    state.wdPaused = false;
    $('wdNextBtn').classList.remove('counting', 'paused');
}

// Podržení prstu: odpočet stojí, puštěním běží dál. Vzhled (pauza na tlačítku,
// zastavené vyplňování) přidá až opravdové podržení — viz obsluha níž.
function pauseCountdown() {
    if (!state.nextTimer) return false;
    clearTimeout(state.nextTimer);
    state.nextTimer = null;
    state.wdLeftMs = Math.max(0, state.wdDeadline - Date.now());
    state.wdPaused = true;
    return true;
}

function resumeCountdown() {
    if (!state.wdPaused) return;
    state.wdPaused = false;
    $('wdNextBtn').classList.remove('paused');
    state.wdDeadline = Date.now() + state.wdLeftMs;
    state.nextTimer = setTimeout(nextWord, state.wdLeftMs);
}

function hideWordDone(animated) {
    const ov = $('wordDoneOverlay');
    if (!ov.classList.contains('active')) return;
    const panel = ov.querySelector('.wd-panel');
    const finish = () => {
        ov.classList.remove('active', 'closing', 'holding');
        panel.style.cssText = '';
        state.wdPaused = false;
        $('wdNextBtn').classList.remove('counting', 'paused');
    };
    if (!animated || REDUCED_MOTION.matches) return finish();
    ov.classList.add('closing');
    slideDown(panel, 260);
    setTimeout(() => { if (ov.classList.contains('closing')) finish(); }, 260);
}

function authorEl(name) {
    const wrap = document.createElement('span');
    wrap.className = 'wd-author';
    const av = document.createElement('span');
    av.className = 'wd-avatar';
    const label = (name || 'Anonym').trim();
    av.textContent = label.charAt(0).toUpperCase() || '?';
    const n = document.createElement('span');
    n.className = 'wd-name';
    n.textContent = label;
    wrap.append(av, n);
    return wrap;
}

function voteBtn(def) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wd-vote' + (def.voted ? ' voted' : '');
    setEmojiText(b, `👍 ${def.votes}`);
    if (def.mine) {
        b.disabled = true;
        b.title = 'Svůj vlastní význam hodnotit nejde';
    } else if (!auth.user) {
        b.disabled = true;
        b.title = 'Hlasovat může jen přihlášený hráč';
    } else {
        b.onclick = (e) => { e.stopPropagation(); voteDef(def, b); };
    }
    return b;
}

async function voteDef(def, btn) {
    const r = await apiPost('/api/defs/vote', { id: def.id });
    if (!r.ok) return showToast((r.data && r.data.error) || 'Hlas se nepodařilo uložit.');
    def.votes = r.data.votes;
    def.voted = r.data.voted;
    setEmojiText(btn, `👍 ${def.votes}`);
    btn.classList.toggle('voted', !!def.voted);
    // Hlas může změnit, kdo je nejlepší — v detailu slova přeřadit.
    if ($('defsModal').classList.contains('active') && state.wdWord) loadDefsList(state.wdWord);
    // Hlas ze sheetu významů promítnout i do karty v mezihře pod ním.
    const top = defCache.get(state.wdWord);
    if (top && top !== def && top.id === def.id) {
        top.votes = def.votes;
        top.voted = def.voted;
        renderWdCard(state.wdWord);
    }
}

/* ---------------- modal se všemi významy ---------------- */

function openDefs(e) {
    if (e) e.stopPropagation();
    holdWordDone();                                       // kdo čte významy, pokračuje sám
    const word = state.wdWord;
    $('defsTitle').textContent = word || 'Významy';
    $('defsError').style.display = 'none';
    $('defsText').value = '';
    $('defsList').innerHTML = '';
    openModal('defsModal');
    renderDefsForm();
    loadDefsList(word);
    refreshAuth().then(renderDefsForm);
}

// Psát smí jen přihlášený — jméno u významu musí za někým stát.
function renderDefsForm() {
    const form = $('defsForm');
    const gate = $('defsGate');
    const canWrite = !!(auth.user && auth.user.handle);
    form.style.display = canWrite ? 'flex' : 'none';
    gate.style.display = canWrite ? 'none' : 'block';
    gate.innerHTML = '';
    if (canWrite) return;
    gate.appendChild(el('p', 'profile-note', auth.enabled
        ? 'Významy může přidávat jen přihlášený hráč — ať je jasné, kdo za nimi stojí.'
        : 'Přidávání významů spustíme, jakmile budou hotové účty.'));
    if (!auth.enabled) return;
    const b = el('button', 'btn btn-primary', auth.user ? 'Zvolit přezdívku' : 'Přihlásit se');
    b.type = 'button';
    b.onclick = () => { closeDefs(); exitPractice(); showProfile(); };
    gate.appendChild(b);
}

function closeDefs() {
    closeSheet($('defsModal'));
}

// Detail slova: štítky s informacemi, nahoře nejlépe hodnocený význam (zlatý,
// s korunou), pod ním ostatní jako kandidáti, pro které jde hlasovat.
async function loadDefsList(word) {
    const list = $('defsList');
    renderWordInfo(word);
    const data = await apiGet(`/api/defs/word?w=${encodeURIComponent(word)}`);
    if (state.wdWord !== word) return;
    const defs = (data && data.defs) || [];
    if (!defs.length) {
        list.replaceChildren(el('li', 'def-empty', data
            ? 'Zatím tu není žádný význam. Buď první!'
            : 'Významy se teď nepodařilo načíst.'));
        return;
    }
    const [best, ...rest] = defs;                          // API řadí podle hlasů
    const items = [defItem(best)];
    if (best.votes > 0) {
        items[0].classList.add('def-item--best');
        items[0].prepend(el('div', 'def-best-label', 'Nejlepší význam'));
    }
    if (rest.length) {
        items.push(el('li', 'def-group', `${best.votes > 0 ? 'Další kandidáti' : 'Další významy'} (${rest.length})`));
        rest.forEach(d => items.push(defItem(d)));
    }
    list.replaceChildren(...items);
}

// Co o slově víme i bez sítě: pořadí podle častosti, obtížnost, délka, přesmyčky.
function renderWordInfo(word) {
    practiceIndex = practiceIndex || new Map(PRACTICE_WORDS.map((w, i) => [w, i]));
    const rank = practiceIndex.get(word);
    const n = lettersOf(word).length;
    const chips = [];
    if (rank !== undefined) {
        chips.push(el('span', 'info-chip', `${fmtNum(rank + 1)}. nejčastější`));
        const lv = rank < 3000 && n <= 5 ? 'lehka' : rank < TOTAL_WORDS ? 'stredni' : 'tezka';
        chips.push(el('span', `info-chip info-chip--level info-chip--${lv}`, PRACTICE_LEVELS[lv].label));
    }
    chips.push(el('span', 'info-chip', `${n} ${plural(n, 'písmeno', 'písmena', 'písmen')}`));
    const box = $('defsInfo');
    box.replaceChildren(...chips);
    const alts = (typeof ALTS !== 'undefined' && ALTS[word]) || [];
    if (alts.length) box.appendChild(el('p', 'defs-alts', `Ze stejných písmen: ${alts.join(', ')}`));
}

function defItem(d) {
    const li = el('li', 'def-item' + (d.mine ? ' mine' : ''));
    const p = el('p', 'wd-text', d.text);                  // cizí text vždy přes textContent
    const actions = el('span', 'def-actions');
    actions.append(voteBtn(d));
    if (d.mine) actions.append(editBtn(d, li, p, () => { loadDefsList(state.wdWord); renderWdCard(state.wdWord); }));
    else if (auth.user) actions.append(reportBtn(d, li));
    const meta = el('div', 'wd-meta');
    meta.append(authorEl(d.author), actions);
    li.append(p, meta);
    return li;
}

// Ikona tužky místo textu „Upravit".
function editBtn(d, li, textEl, onSaved) {
    const b = el('button', 'def-icon-btn def-edit');
    b.type = 'button';
    b.title = 'Upravit';
    b.setAttribute('aria-label', 'Upravit význam');
    b.onclick = () => editDef(d, li, textEl, onSaved);
    return b;
}

// Vlaječka; první klepnutí se zeptá („Nahlásit?"), druhé nahlásí — omylem
// ťuknutá ikona nikoho neudá. Po 3 s se vrátí zpátky.
function reportBtn(d, li) {
    const b = el('button', 'def-icon-btn def-flag');
    b.type = 'button';
    b.title = 'Nahlásit nevhodný význam';
    b.setAttribute('aria-label', 'Nahlásit nevhodný význam');
    b.onclick = () => {
        clearTimeout(b.revert);
        if (b.classList.contains('confirm')) return reportDef(d, li);
        b.classList.add('confirm');
        b.textContent = 'Nahlásit?';
        b.revert = setTimeout(() => { b.classList.remove('confirm'); b.textContent = ''; }, 3000);
    };
    return b;
}

// Autor smí svůj význam upravit. Když už má hlasy, úprava je smaže — jinak by
// šlo vyhlasovat neškodnou větu a pak ji přepsat.
function editDef(d, li, textEl, onSaved) {
    if (li.querySelector('form')) return;
    const form = el('form', 'feedback-form');
    const ta = document.createElement('textarea');
    ta.maxLength = 200;
    ta.required = true;
    ta.value = d.text;
    const err = el('p', 'feedback-error');
    err.style.display = 'none';
    const save = el('button', 'btn btn-primary', 'Uložit změnu');
    save.type = 'submit';
    const cancel = el('button', 'btn-tertiary', 'Zrušit');
    cancel.type = 'button';
    cancel.onclick = () => form.remove();
    if (d.votes > 0) form.appendChild(el('p', 'profile-note', 'Úpravou se smažou dosavadní hlasy.'));
    form.append(ta, err, save, cancel);
    form.onsubmit = async (e) => {
        e.preventDefault();
        save.disabled = true;
        const r = await apiPost('/api/defs/edit', { id: d.id, text: ta.value });
        save.disabled = false;
        if (!r.ok) {
            err.textContent = (r.data && r.data.error) || 'Nepodařilo se uložit.';
            err.style.display = 'block';
            return;
        }
        d.text = ta.value.trim();
        d.votes = r.data.votes;
        textEl.textContent = d.text;
        form.remove();
        defCache.delete(d.word);
        if (onSaved) onSaved();
        showToast(r.data.resetVotes ? 'Upraveno, hlasy vynulovány.' : 'Upraveno.');
    };
    li.appendChild(form);
}

async function reportDef(d, li) {
    const r = await apiPost('/api/defs/report', { id: d.id });
    if (!r.ok) return showToast('Nahlášení se nepodařilo.');
    li.remove();
    showToast('Díky, nahlášeno.');
}

async function submitDef(e) {
    e.preventDefault();
    const word = state.wdWord;
    const btn = $('defsSubmit');
    const err = $('defsError');
    err.style.display = 'none';
    btn.disabled = true;
    const r = await apiPost('/api/defs', { word, text: $('defsText').value });
    btn.disabled = false;
    if (!r.ok) {
        err.textContent = (r.data && r.data.error) || 'Význam se nepodařilo uložit.';
        err.style.display = 'block';
        return;
    }
    $('defsText').value = '';
    defCache.delete(word);
    await loadDefsList(word);
    const fresh = await apiGet(defsUrl(word));
    if (fresh && fresh.defs) defCache.set(word, fresh.defs[word] || null);
    renderWdCard(word);
    showToast('Díky! Význam je uložený.');
}

/* ---------------- účet (magic link) ---------------- */

// Dokud nejsou nastavené secrety pro odesílání pošty, vrací /api/me auth:false
// a sekce účtu se vůbec neukáže — hra jede dál anonymně.
const auth = { enabled: false, user: null, polling: null };

async function refreshAuth() {
    const d = await apiGet('/api/me');
    auth.enabled = !!(d && d.auth);
    auth.user = d ? d.user : null;
}

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

// Emoji v textu UI obalí do <span class="emoji" data-emoji="…">, ať ho design
// může vyměnit za vlastní ikonu (designs/kostky/); bez CSS zůstane emoji.
// \n se převede na <br>. Staví DOM, ne HTML — text může přijít i z backendu.
const EMOJI_NAMES = { '👍': 'palec', '🏆': 'trofej', '👑': 'koruna', '🏅': 'medaile', '💔': 'srdce', '🔓': 'odemceno', '🔒': 'zamceno', '🔥': 'plamen' };
const EMOJI_RE = new RegExp(`(${Object.keys(EMOJI_NAMES).join('|')}|\n)`, 'u');
function setEmojiText(node, text) {
    node.replaceChildren(...String(text).split(EMOJI_RE).filter(Boolean).map(part => {
        if (part === '\n') return document.createElement('br');
        if (!EMOJI_NAMES[part]) return part;
        const s = el('span', 'emoji', part);
        s.dataset.emoji = EMOJI_NAMES[part];
        return s;
    }));
    return node;
}

function renderAccount() {
    const section = $('accountSection');
    const box = $('accountBox');
    box.innerHTML = '';
    $('accountEnd').replaceChildren();
    $('accountEnd').hidden = true;
    if (!auth.enabled) { section.style.display = 'none'; return; }
    section.style.display = 'flex';

    if (auth.user && auth.user.needsHandle) return renderHandlePicker(box);
    if (auth.user) return renderSignedIn(box);
    if (persist.pendingLogin) return renderAwaitingCode(box);
    renderSignedOut(box);
}

function renderSignedOut(box) {
    const form = el('form', 'feedback-form');
    const input = el('input');
    input.type = 'email';
    input.placeholder = 'tvuj@email.cz';
    input.autocomplete = 'email';
    input.required = true;
    const btn = el('button', 'btn btn-primary', 'Poslat přihlašovací odkaz');
    btn.type = 'submit';
    const err = el('p', 'feedback-error');
    err.style.display = 'none';
    form.append(input, err, btn);
    form.onsubmit = async (e) => {
        e.preventDefault();
        btn.disabled = true;
        const r = await apiPost('/api/auth/start', { email: input.value });
        btn.disabled = false;
        if (!r.ok) {
            err.textContent = (r.data && r.data.error) || 'Nepodařilo se odeslat.';
            err.style.display = 'block';
            return;
        }
        persist.pendingLogin = { id: r.data.loginId, expiresAt: r.data.expiresAt };
        savePersist();
        renderAccount();
        startLoginPolling();
    };
    box.append(form, el('p', 'profile-note',
        'Pošleme ti odkaz a kód. Účet propojí tvoje významy napříč zařízeními.'));
}

function renderAwaitingCode(box) {
    box.append(el('p', 'profile-note',
        'Poslali jsme ti e-mail. Klepni na odkaz a vrať se sem — nebo rovnou opiš kód.'));
    const form = el('form', 'feedback-form');
    const input = el('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'one-time-code';
    input.maxLength = 6;
    input.placeholder = '6místný kód';
    const btn = el('button', 'btn btn-primary', 'Potvrdit kód');
    btn.type = 'submit';
    const err = el('p', 'feedback-error');
    err.style.display = 'none';
    form.append(input, err, btn);
    form.onsubmit = async (e) => {
        e.preventDefault();
        btn.disabled = true;
        const r = await apiPost('/api/auth/verify',
            { loginId: persist.pendingLogin.id, code: input.value.trim() });
        btn.disabled = false;
        const st = r.data && r.data.status;
        if (st === 'ok') return onLoggedIn(r.data.user);
        err.textContent = st === 'badcode'
            ? `Kód nesedí. Zbývá ${r.data.left} pokusů.`
            : 'Platnost vypršela, nech si poslat nový odkaz.';
        err.style.display = 'block';
        if (st !== 'badcode') { persist.pendingLogin = null; savePersist(); renderAccount(); }
    };
    const cancel = el('button', 'btn-tertiary', 'Začít znovu');
    cancel.onclick = () => { stopLoginPolling(); persist.pendingLogin = null; savePersist(); renderAccount(); };
    box.append(form, cancel);
}

function renderHandlePicker(box) {
    box.append(el('p', 'profile-note', 'Vyber si přezdívku — uvidí ji ostatní u tvých významů.'));
    const form = el('form', 'feedback-form');
    const input = el('input');
    input.type = 'text';
    input.maxLength = 20;
    input.placeholder = 'Přezdívka';
    input.value = persist.nick || '';
    const btn = el('button', 'btn btn-primary', 'Uložit přezdívku');
    btn.type = 'submit';
    const err = el('p', 'feedback-error');
    err.style.display = 'none';
    form.append(input, err, btn);
    form.onsubmit = async (e) => {
        e.preventDefault();
        btn.disabled = true;
        const r = await apiPost('/api/me/handle', { handle: input.value.trim() });
        btn.disabled = false;
        if (!r.ok) {
            err.textContent = (r.data && r.data.error) || 'Nepodařilo se uložit.';
            err.style.display = 'block';
            return;
        }
        auth.user = r.data.user;
        persist.nick = r.data.user.handle;
        savePersist();
        renderProfile();
    };
    box.append(form);
}

function renderSignedIn(box) {
    box.append(el('p', 'profile-note', `Přihlášen jako ${auth.user.handle}. Významy se ukládají k účtu.`));
    const link = `${siteUrl().replace(/\/$/, '')}/u/${encodeURIComponent(auth.user.handle)}`;
    const show = el('a', 'btn btn-secondary', 'Můj veřejný profil');
    show.href = link;
    show.target = '_blank';
    show.rel = 'noopener';
    const share = el('button', 'btn-tertiary', 'Sdílet odkaz na profil');
    share.onclick = async () => {
        if (navigator.share) { try { await navigator.share({ url: link }); return; } catch (e) { return; } }
        try { await navigator.clipboard.writeText(link); showToast('Odkaz zkopírován.'); }
        catch (e) { showToast(link); }
    };
    box.append(show, share);
    const out = el('button', 'btn btn-secondary', 'Odhlásit se');
    out.onclick = async () => {
        await apiPost('/api/auth/logout', {});
        auth.user = null;
        renderProfile();
        showToast('Odhlášeno.');
    };
    const del = el('button', 'btn btn-danger', 'Smazat účet');
    del.onclick = async () => {
        if (!confirm('Opravdu smazat účet? Tvoje významy zůstanou ostatním, jen se z nich sundá tvoje jméno.')) return;
        await apiPost('/api/me/delete', {});
        auth.user = null;
        persist.nick = '';
        savePersist();
        renderProfile();
        showToast('Účet smazán.');
    };
    // Odhlášení a nevratné smazání úplně dole na profilu, ne mezi běžnými akcemi.
    $('accountEnd').replaceChildren(out, del);
    $('accountEnd').hidden = false;
}

function onLoggedIn(user) {
    stopLoginPolling();
    auth.user = user;
    persist.pendingLogin = null;
    savePersist();
    backfillProfile();
    renderProfile();
    showToast('Přihlášeno!');
}

// Historie odehraná před přihlášením. Index dne jde v prvním roce jednoznačně
// převést na datum, takže profil nezačíná prázdný.
function backfillProfile() {
    const days = Object.entries(persist.results).map(([idx, score]) => {
        const d = new Date(EPOCH + Number(idx) * 86400000);
        return { d: d.toISOString().slice(0, 10), score, dayIdx: Number(idx) };
    });
    if (days.length) apiPost('/api/profile/backfill', { days });
}

// Odkaz z mailu se otevře v jiném prohlížeči (a na iOS má instalovaná PWA
// vlastní cookies), takže session si vyzvedne až tenhle poll.
function startLoginPolling() {
    stopLoginPolling();
    if (!persist.pendingLogin) return;
    const id = persist.pendingLogin.id;
    let left = 150;                                   // ~5 minut po 2 s
    auth.polling = setInterval(async () => {
        if (--left < 0 || !persist.pendingLogin) return stopLoginPolling();
        const d = await apiGet(`/api/auth/poll?id=${encodeURIComponent(id)}`);
        if (!d) return;
        if (d.status === 'ok') return onLoggedIn(d.user);
        if (d.status === 'expired') {
            stopLoginPolling();
            persist.pendingLogin = null;
            savePersist();
            renderAccount();
        }
    }, 2000);
}

function stopLoginPolling() {
    clearInterval(auth.polling);
    auth.polling = null;
}

/* ---------------- profil ---------------- */

function showProfile() {
    $('profileNickForm').style.display = 'none';
    $('profileNickBtn').style.display = '';
    renderProfile();
    showScreen('profile');
    refreshAuth().then(() => {
        renderProfile();
        if (persist.pendingLogin && !auth.user) startLoginPolling();
    });
}

function renderProfile() {
    $('collectionChip').textContent = `Den ${dayIndex() + 1}/${TOTAL_LEVELS} · ${fmtNum(uncoveredCount())}/${fmtNum(TOTAL_WORDS)} slov`;
    const days = Object.keys(persist.results).length;
    const words = Object.values(persist.results).reduce((a, b) => a + b, 0);
    const pct = days ? Math.round(words / (days * WORDS_PER_DAY) * 100) : 0;

    // Účty zatím neběží, takže je profil lokální — statistiky jsou skutečné,
    // jen se počítají z localStorage tohohle zařízení.
    const nick = ((auth.user && auth.user.handle) || persist.nick || '').trim();
    $('profileAvatar').textContent = (nick || 'Host').charAt(0).toUpperCase();
    $('profileName').textContent = nick || 'Host';
    $('profileSub').textContent = persist.bestStreak > 0
        ? `Nejdelší série: ${fmtNum(persist.bestStreak)}`
        : 'Zatím bez série';
    $('profileNickBtn').textContent = nick ? 'Změnit přezdívku' : 'Nastavit přezdívku';
    $('profileNote').textContent = nick
        ? 'Přezdívka se ukazuje u významů, které přidáš. Přihlášení k účtu přijde později — zatím je všechno uložené jen v tomhle zařízení.'
        : 'Přezdívkou se podepíšeš u významů, které přidáš. Přihlášení k účtu přijde později — zatím je všechno uložené jen v tomhle zařízení.';

    const tiles = [
        [fmtNum(persist.streak), 'dní v řadě', persist.streak ? '' : 'stat-tile--off'],
        [fmtNum(days), 'odehraných dní'],
        [fmtNum(words), 'slov v denní výzvě'],
        [pct + ' %', 'úspěšnost'],
        [fmtNum(practiceSeenCount()), `uhodnutých slov v tréninku, to je ${practiceSeenPct()} % slovníku`, 'stat-tile--wide'],
    ];
    const grid = $('profileStats');
    grid.innerHTML = '';
    for (const [value, label, extra] of tiles) {
        const tile = document.createElement('div');
        tile.className = extra ? 'stat-tile ' + extra : 'stat-tile';
        const v = document.createElement('div');
        v.className = 'stat-value';
        v.textContent = value;
        const l = document.createElement('div');
        l.className = 'stat-label';
        l.textContent = label;
        tile.append(v, l);
        grid.appendChild(tile);
    }

    renderAccount();
    $('profileDeviceNote').style.display = auth.user ? 'none' : 'block';
    $('profileDeviceNote').textContent = auth.enabled
        ? 'Série i postup žijí jen v tomhle zařízení. Přihlášením o ně nepřijdeš.'
        : 'Série i postup žijí jen v tomhle zařízení — vymazáním dat prohlížeče zmizí.';
    // Přihlášený má jméno z účtu; anonymní si ho volí sám.
    $('profileNickBtn').style.display = auth.user ? 'none' : '';
    loadMyDefs();
}

// Profil: oblak štítků (slovo + palce) s nejlépe hodnocenými významy a odkaz
// na obrazovku se všemi. Celé karty s úpravou jsou až tam.
const PROFILE_TAGS = 12;
async function loadMyDefs() {
    const box = $('profileDefs');
    box.className = 'empty-card';
    box.textContent = 'Načítám…';
    const data = await apiGet(`/api/defs/mine?sort=votes&limit=${PROFILE_TAGS}`);
    if (!data || !data.defs) {
        box.textContent = 'Významy se teď nepodařilo načíst.';
        return;
    }
    const total = data.total ?? data.defs.length;
    if (!total) {
        box.textContent = 'Zatím žádný. V tréninku se ti po každém slově nabídne, ať nějaký přidáš.';
        return;
    }
    box.className = 'def-cloud';
    box.replaceChildren(...data.defs.map(d => {
        const tag = el('span', 'def-tag' + (d.hidden ? ' def-tag--hidden' : ''));
        tag.append(el('span', 'def-tag-word', d.word), setEmojiText(el('span', 'def-tag-votes'), `👍 ${d.votes}`));
        return tag;
    }));
    const all = el('button', 'btn-tertiary def-cloud-all', `Všechny moje významy (${fmtNum(total)})`);
    all.type = 'button';
    all.onclick = () => showMyDefs(0);
    box.appendChild(all);
}

// Obrazovka Moje významy: po MY_DEFS_PAGE, nejnovější nahoře, s úpravou.
const MY_DEFS_PAGE = 10;
async function showMyDefs(page) {
    state.myDefsPage = page;
    showScreen('myDefs');
    window.scrollTo(0, 0);
    const list = $('myDefsList');
    list.replaceChildren(el('li', 'def-empty', 'Načítám…'));
    const data = await apiGet(`/api/defs/mine?limit=${MY_DEFS_PAGE}&offset=${page * MY_DEFS_PAGE}`);
    if (state.myDefsPage !== page) return;                // mezitím se přeplo jinam
    const pager = $('myDefsPager');
    if (!data || !data.defs) {
        list.replaceChildren(el('li', 'def-empty', 'Významy se teď nepodařilo načíst.'));
        pager.hidden = true;
        return;
    }
    const pages = Math.max(1, Math.ceil(data.total / MY_DEFS_PAGE));
    if (page > 0 && page >= pages) return showMyDefs(pages - 1);
    $('myDefsSummary').textContent = data.total
        ? `${fmtNum(data.total)} ${plural(data.total, 'význam', 'významy', 'významů')}, nejnovější nahoře.`
        : 'Zatím žádný. V tréninku se ti po každém slově nabídne, ať nějaký přidáš.';
    list.replaceChildren(...data.defs.map(myDefItem));
    pager.hidden = pages < 2;
    $('myDefsPrev').disabled = page === 0;
    $('myDefsNext').disabled = page >= pages - 1;
    $('myDefsInfo').textContent = `${page + 1} / ${pages}`;
}

function myDefItem(d) {
    const li = el('li', 'def-item mine');
    const head = el('div', 'def-word', d.word);
    if (d.hidden) head.appendChild(el('span', 'def-hidden', 'skrytý po nahlášení'));
    const p = el('p', 'wd-text', d.text);                  // cizí text vždy přes textContent
    const meta = el('div', 'wd-meta');
    const votes = setEmojiText(el('span'), `👍 ${d.votes}`);
    // po uložení se počet hlasů může vynulovat — překreslit jen tuhle kartu
    meta.append(votes, editBtn(d, li, p, () => setEmojiText(votes, `👍 ${d.votes}`)));
    li.append(head, p, meta);
    return li;
}

function editNick() {
    $('profileNickForm').style.display = 'flex';
    $('profileNickBtn').style.display = 'none';
    $('profileNickInput').value = persist.nick || '';
    $('profileNickInput').focus();
}

function saveNick(e) {
    e.preventDefault();
    persist.nick = $('profileNickInput').value.trim().slice(0, 20);
    savePersist();
    $('profileNickForm').style.display = 'none';
    $('profileNickBtn').style.display = '';
    renderProfile();
    showToast(persist.nick ? 'Přezdívka uložená.' : 'Přezdívka zrušená.');
}

function playToday() {
    const today = todayStr();
    if (persist.day && persist.day.done && persist.day.date === today) {
        restoreFinishedDay();
        showResult(true);
        return;
    }
    startGame();
}

/* ---------------- start hry ---------------- */

function shuffleArr(arr) {
    const original = lettersOf(state.words[state.wordIdx] || '');
    for (let attempts = 0; attempts < 200; attempts++) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        if (arr.join('') !== original) break;
    }
    return arr;
}

function startGame() {
    const today = todayStr();
    state.gen++;
    state.mode = 'daily';
    $('game').classList.remove('practice');
    $('closeGameBtn').style.display = 'flex';
    $('closeGameBtn').setAttribute('aria-label', 'Ukončit výzvu');
    const idx = dayIndex(today);
    state.words = dayWords(idx);

    const d = persist.day;
    if (d && !d.done && d.date === today && d.dayIdx === idx && d.wordIdx < WORDS_PER_DAY) {
        // rozehraný dnešek — pokračujeme, kde jsme skončili
        state.wordIdx = d.wordIdx;
        state.marks = d.marks.slice();
        state.time = Math.max(1, Math.min(START_TIME, d.time || START_TIME));
        state.resumed = true;
    } else {
        state.wordIdx = 0;
        state.marks = [];
        state.time = START_TIME;
        state.resumed = false;
        persist.day = { date: today, dayIdx: idx, wordIdx: 0, marks: [], time: START_TIME, done: false, perfect: false };
        savePersist();
    }
    state.solved = state.marks.filter(Boolean).length;
    placeGameGrid('game');
    showScreen('game');
    if (IS_DESKTOP && !persist.kbHintShown) {
        persist.kbHintShown = true;
        savePersist();
        setTimeout(() => showToast('Můžeš psát i na klávesnici'), 800);
    }
    loadWord();
}

// Obtížnost tréninku = kolik nejčastějších slov z PRACTICE_WORDS se hraje
// (pool je seřazený podle frekvence). Střední je přesně rozsah denní výzvy.
// Lehká navíc jen do 5 písmen: u přesmyčky rozhoduje hlavně délka (5 písmen =
// 120 pořadí, 7 = 5040) a mezi 3000 nejčastějšími je 60 % slov delších.
const PRACTICE_LEVELS = {
    lehka:   { label: 'Lehká',   size: 3000, maxLetters: 5 },   // 1215 slov
    stredni: { label: 'Střední', size: TOTAL_WORDS },
    tezka:   { label: 'Těžká',   size: PRACTICE_WORDS.length },
};
const practiceLevel = () => PRACTICE_LEVELS[persist.practiceLevel] || PRACTICE_LEVELS.stredni;

// Různá uhodnutá slova tréninku: bitmapa nad PRACTICE_WORDS v base64
// (15 000 bitů ≈ 2,5 kB). Jen z nich dává smysl „X % slovníku" — počítadlo
// practiceWords sčítá i opakování.
let practiceIndex = null;
const seenBytes = () => persist.practiceSeen
    ? Uint8Array.from(atob(persist.practiceSeen), c => c.charCodeAt(0))
    : new Uint8Array(Math.ceil(PRACTICE_WORDS.length / 8));

function markPracticeSeen(word) {
    practiceIndex = practiceIndex || new Map(PRACTICE_WORDS.map((w, i) => [w, i]));
    const i = practiceIndex.get(word);
    if (i === undefined) return;
    const bytes = seenBytes();
    bytes[i >> 3] |= 1 << (i & 7);
    persist.practiceSeen = btoa(String.fromCharCode(...bytes));
}

function practiceSeenCount() {
    let n = 0;
    for (let b of seenBytes()) for (; b; b &= b - 1) n++;
    return n;
}

// Pod 1 % dvě desetinná místa (3 slova = 0,02 %), jinak jedno — první desítky
// slov nesmí vypadat jako „0 %".
function practiceSeenPct() {
    const pct = practiceSeenCount() / PRACTICE_WORDS.length * 100;
    return pct.toLocaleString('cs-CZ', { maximumFractionDigits: pct < 1 ? 2 : 1 });
}

function openPracticePicker() {
    $$('#practiceModal .level-option').forEach(b =>
        b.classList.toggle('current', b.dataset.level === persist.practiceLevel));
    openModal('practiceModal');
}

function pickPracticeLevel(level) {
    persist.practiceLevel = level;
    savePersist();
    closeModal();
    startPracticeGame();
}

function startPracticeGame() {
    const level = practiceLevel();
    const pool = PRACTICE_WORDS.slice(0, level.size)
        .filter(w => !level.maxLetters || lettersOf(w).length <= level.maxLetters);
    state.gen++;
    state.mode = 'practice';
    $('game').classList.add('practice');
    $('closeGameBtn').style.display = 'flex';
    $('closeGameBtn').setAttribute('aria-label', 'Ukončit trénink');
    refreshAuth();                       // mezihra podle něj popisuje odkaz na významy
    state.pool = pool;
    state.practiceQueue = shuffleCopy(pool);
    state.words = [];
    state.wordIdx = 0;
    state.marks = [];
    state.solved = 0;
    state.practiceCount = 0;
    state.lostStreak = 0;
    clearTimeout(state.nextTimer);
    state.nextTimer = null;
    hideWordDone();
    state.time = START_TIME;
    stopConfetti();
    placeGameGrid('game');
    showScreen('game');
    loadWord();
    prefetchDefs();
}

function shuffleCopy(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// Bere slova z promíchané fronty bez opakování; když dojde, znovu promíchá
// celý pool (a snaží se nezopakovat úplně poslední slovo hned znovu).
function pickPracticeWord() {
    if (state.practiceQueue.length === 0) {
        state.practiceQueue = shuffleCopy(state.pool);
        const last = state.words[state.wordIdx - 1];
        if (state.practiceQueue.length > 1 && state.practiceQueue[0] === last) {
            [state.practiceQueue[0], state.practiceQueue[1]] = [state.practiceQueue[1], state.practiceQueue[0]];
        }
    }
    return state.practiceQueue.pop();
}

/* ---------------- kolo (jedno slovo) ---------------- */

function loadWord() {
    if (state.mode === 'daily' && state.wordIdx >= WORDS_PER_DAY) return finishDay();
    if (state.mode === 'practice' && !state.words[state.wordIdx]) {
        state.words[state.wordIdx] = pickPracticeWord();
    }
    const target = state.words[state.wordIdx];
    state.letters = lettersOf(target).split('');
    state.selected = [];
    state.processing = false;
    state.shuffledThisWord = false;
    shuffleArr(state.letters);
    const isResume = state.resumed;
    state.resumed = false;
    const shouldAnimate = !isResume && state.wordIdx > 0;
    const leftover = state.time;
    renderLetters(shouldAnimate);
    renderGameGrid();
    if (shouldAnimate && leftover < START_TIME) {
        updateUI();
        animateTimerUp(leftover);
    } else {
        if (!isResume) state.time = START_TIME;
        startTimer();
    }
}

function getMaxPerRow(n) {
    if (n <= 4) return 2;
    if (n <= 6) return 3;
    if (n <= 9) return 4;
    return 5;
}

function letterSize(n) {
    if (n <= 8) return { d: 76, f: 34 };
    if (n <= 12) return { d: 62, f: 28 };
    return { d: 50, f: 23 };
}

// Sloty podle celého hesla: nepísmenné znaky (mezera, tečka, pomlčka)
// jsou pevně předvyplněné a neskládají se.
function renderSlots(container, target, animate) {
    container.innerHTML = '';
    const chars = [...target];
    const n = chars.length;
    const avail = Math.min(window.innerWidth - 48, 420);
    const perRow = Math.min(n, 10);
    const size = Math.max(24, Math.min(46, Math.floor((avail - (perRow - 1) * 6) / perRow)));
    chars.forEach((ch, i) => {
        const s = document.createElement('div');
        const locked = !LETTER_RE.test(ch);
        s.className = 'answer-slot' + (locked ? ' locked filled' : '') + (animate ? ' entering' : '');
        if (locked) s.textContent = ch === ' ' ? '␣' : ch;
        if (animate) s.style.animationDelay = (i * 40) + 'ms';
        s.style.width = size + 'px';
        s.style.height = Math.round(size * 1.08) + 'px';
        s.style.fontSize = Math.round(size * 0.56) + 'px';
        container.appendChild(s);
    });
}

function renderLetters(animate) {
    const row = $('letterRow');
    row.innerHTML = '';
    const n = state.letters.length;
    const cols = getMaxPerRow(n);
    const { d, f } = letterSize(n);
    row.style.width = (cols * d + (cols - 1) * 6) + 'px';

    renderSlots($('wordDisplay'), state.words[state.wordIdx], animate);

    state.letters.forEach((letter, i) => {
        const el = document.createElement('div');
        el.className = 'letter' + (animate ? ' entering' : '');
        el.textContent = letter;
        el.dataset.index = i;
        el.style.width = d + 'px';
        el.style.height = d + 'px';
        el.style.fontSize = f + 'px';
        if (animate) el.style.animationDelay = (i * 40) + 'ms';
        el.addEventListener('pointerdown', e => {
            if (e.target !== el) return; // dotyk šel na haptický přepínač níže, ten si volá handleTap sám
            e.preventDefault();
            handleTap(el);
        });
        row.appendChild(el);
        addLetterHapticOverlay(el); // až po appendChild — getComputedStyle potřebuje připojený element
    });
}

// Skutečný, neviditelný přepínač přes celé písmenko: na iOS 26.5+ funguje
// nativní haptika jen na opravdový dotyk switch prvku, ne na programové
// kliknutí (viz iosTap výše). 'input' event pak spustí stejnou herní logiku.
function addLetterHapticOverlay(el) {
    if ('vibrate' in navigator || !COARSE_POINTER) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.setAttribute('switch', '');
    sw.setAttribute('aria-hidden', 'true');
    sw.tabIndex = -1;
    sw.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;border-radius:inherit;';
    sw.addEventListener('input', () => handleTap(el));
    el.appendChild(sw);
}

function clearIncorrectState() {
    if (!state.incorrectTimeout) return;
    clearTimeout(state.incorrectTimeout);
    state.incorrectTimeout = null;
    $('wordDisplay').classList.remove('shake');
    $('letterRow').classList.remove('shake');
    $$('#letterRow .letter').forEach(l => l.classList.remove('incorrect', 'selected'));
    state.selected = [];
}

function selectLetter(el) {
    if (state.incorrectTimeout) { clearIncorrectState(); updateUI(); }
    const idx = +el.dataset.index;
    if (state.selected.includes(idx)) return;
    haptic('tap');
    state.selected.push(idx);
    playLetterSound(state.selected.length);
    el.classList.add('selected');
    updateUI();
}

function handleTap(el) {
    if (state.processing) return;
    const idx = +el.dataset.index;
    const pos = state.selected.indexOf(idx);
    if (pos !== -1) {
        haptic('tap');
        playRemoveSound();
        state.selected.splice(pos);
        $$('#letterRow .letter').forEach(l => {
            if (!state.selected.includes(+l.dataset.index)) l.classList.remove('selected');
        });
    } else {
        selectLetter(el);
        if (state.selected.length === state.letters.length) checkWord();
    }
    if (!state.processing) updateUI();
}

function resetSelection() {
    if (state.processing) return;
    clearIncorrectState();
    state.selected = [];
    $$('#letterRow .letter').forEach(l => l.classList.remove('selected'));
    updateUI();
}

function isAcceptedWord(word, target) {
    if (word === lettersOf(target)) return true;
    // Přesmyčky uznává jen trénink. Denní výzva je soutěž — všichni mají dnes
    // stejných 20 slov, takže musí padnout přesně to hledané.
    if (state.mode !== 'practice') return false;
    const alts = (typeof ALTS !== 'undefined' && ALTS[target]) || [];
    return alts.some(a => lettersOf(a) === word);
}

function checkWord() {
    if (state.processing) return;
    const word = state.selected.map(i => state.letters[i]).join('');
    const target = state.words[state.wordIdx] || '';

    if (word.length !== state.letters.length || !isAcceptedWord(word, target)) {
        haptic('error');
        playErrorSound();
        $('wordDisplay').classList.add('shake');
        $('letterRow').classList.add('shake');
        $$('#letterRow .letter.selected').forEach(l => l.classList.add('incorrect'));
        state.incorrectTimeout = setTimeout(() => {
            $('wordDisplay').classList.remove('shake');
            $('letterRow').classList.remove('shake');
            $$('#letterRow .letter.selected').forEach(l => l.classList.remove('incorrect'));
            resetSelection();
            state.incorrectTimeout = null;
        }, 400);
        return;
    }

    state.processing = true;
    clearInterval(state.timer);
    haptic('success');
    playSuccessSound();
    $('wordDisplay').classList.add('pulse', 'found');
    $('letterRow').classList.add('pulse');
    $$('#letterRow .letter.selected').forEach(l => l.classList.add('correct'));

    state.wordIdx++;
    state.solved++;
    state.marks.push(true);
    if (state.mode === 'practice') {
        state.practiceCount++;
        persist.practiceWords++;   // trénink se jinak nikam neukládá
        markPracticeSeen(target);
        savePersist();
    }
    updateGameGrid(state.marks.length - 1);
    saveDayProgress();

    setTimeout(() => {
        $('wordDisplay').classList.remove('pulse');
        $('letterRow').classList.remove('pulse');
        const els = [$('wordDisplay'), ...$$('#letterRow .letter')];
        els.forEach(el => {
            el.classList.remove('entering');
            el.style.animation = 'none';
            el.style.transition = 'none';
            el.style.opacity = '1';
            el.style.transform = 'scale(1)';
        });
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                els.forEach(el => {
                    el.style.transition = 'opacity 0.25s ease-out, transform 0.25s ease-out';
                    el.style.opacity = '0';
                    el.style.transform = 'scale(0.85)';
                });
            });
        });
    }, 450);

    const genOk = state.gen;
    // V tréninku vyjede panel mezihry hned po zeleném bliknutí.
    if (state.mode === 'practice') setTimeout(() => showWordDone(target, genOk, true), 450);
    setTimeout(() => {
        if (state.gen !== genOk) return;
        $('wordDisplay').classList.remove('found');
        if (state.mode === 'practice') return;   // styl slova vrátí nextWord, ať pod panelem neprobleskne
        $('wordDisplay').style.cssText = '';
        loadWord();
    }, 750);
}

function handleTimeout() {
    if (state.processing) return;
    state.processing = true;
    const gen = state.gen;
    haptic('miss');
    playMissSound();
    clearIncorrectState();

    const wd = $('wordDisplay');
    const target = state.words[state.wordIdx] || '';
    state.wordIdx++;
    state.marks.push(false);
    updateGameGrid(state.marks.length - 1);
    saveDayProgress();

    // Trénink: slovo ukáže až panel mezihry (kostky se v něm přeskládají
    // z rozsypaného pořadí), hra jen zmizí. Série tréninku tu končí.
    if (state.mode === 'practice') {
        state.lostStreak = state.practiceCount;
        state.practiceCount = 0;
        [wd, ...$$('#letterRow .letter')].forEach(el => {
            el.style.transition = 'opacity .25s ease-out, transform .25s ease-out';
            el.style.opacity = '0';
            el.style.transform = 'scale(.85)';
        });
        setTimeout(() => showWordDone(target, gen, false), 300);
        return;
    }

    const chars = [...target];
    const slots = [...wd.querySelectorAll('.answer-slot')];

    slots.forEach(s => {
        if (!s.classList.contains('locked')) {
            s.textContent = '';
            s.classList.remove('filled');
        }
        s.style.animation = 'none';
    });

    // Postupně odhalit hledané slovo červeně.
    const stagger = 65;
    slots.forEach((s, i) => {
        setTimeout(() => {
            s.textContent = chars[i] === ' ' ? '␣' : (chars[i] || '');
            s.classList.add('filled', 'missed');
            s.style.animation = 'missedReveal .34s cubic-bezier(.34,1.56,.64,1) both';
        }, i * stagger);
    });

    const revealDone = slots.length * stagger + 340;
    const hold = 850;

    setTimeout(() => {
        if (state.gen !== gen) return;
        const els = [wd, ...$$('#letterRow .letter')];
        els.forEach(el => {
            el.style.transition = 'opacity .3s ease-out, transform .3s ease-out';
            el.style.opacity = '0';
            el.style.transform = 'scale(.85)';
        });
    }, revealDone + hold);

    setTimeout(() => {
        if (state.gen !== gen) return;
        wd.style.cssText = '';
        loadWord();
    }, revealDone + hold + 320);
}

/* ---------------- FLIP zamíchání (Shift) ---------------- */

function shuffleLetters() {
    if (state.processing || state.shuffledThisWord) return;
    const row = $('letterRow');
    const tiles = [...row.children];
    if (tiles.length < 2) return;
    state.shuffledThisWord = true;
    haptic('tap');

    tiles.forEach(t => { t.classList.remove('entering'); t.style.animation = 'none'; });
    const firstRects = tiles.map(t => t.getBoundingClientRect());

    let order;
    do {
        order = tiles.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
    } while (order.some((v, i) => v === i));

    order.forEach(i => row.appendChild(tiles[i]));

    tiles.forEach((t, i) => {
        const last = t.getBoundingClientRect();
        const dx = firstRects[i].left - last.left;
        const dy = firstRects[i].top - last.top;
        t.style.transition = 'none';
        t.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    requestAnimationFrame(() => {
        tiles.forEach(t => {
            t.style.transition = 'transform .34s cubic-bezier(.34,1.56,.64,1)';
            t.style.transform = '';
        });
    });
    setTimeout(() => {
        tiles.forEach(t => { t.style.transition = ''; t.style.transform = ''; });
    }, 420);
}

/* ---------------- grid + progress UI ---------------- */

function placeGameGrid(screen) {
    const grid = $('gameGrid');
    if (screen === 'result') {
        $('result').insertBefore(grid, $('winBanner'));
        grid.classList.add('result-grid');
    } else {
        $('game').insertBefore(grid, $('progress'));
        grid.classList.remove('result-grid');
    }
}

function renderGameGrid() {
    const el = $('gameGrid');
    if (state.mode === 'practice') { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'grid';
    if (el.children.length !== WORDS_PER_DAY) {
        el.innerHTML = '';
        for (let i = 0; i < WORDS_PER_DAY; i++) {
            const c = document.createElement('div');
            c.className = 'pg-cell';
            el.appendChild(c);
        }
    }
    updateGameGrid();
}

function updateGameGrid(popIndex) {
    const el = $('gameGrid');
    const marks = state.marks || [];
    [...el.children].forEach((c, i) => {
        c.classList.toggle('solved', i < marks.length && marks[i]);
        c.classList.toggle('missed', i < marks.length && !marks[i]);
        if (popIndex === i) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
    });
}

function updateUI() {
    const chosen = state.selected.map(i => state.letters[i]);
    let li = 0; // index do vybraných písmen — zamčené sloty se přeskakují
    $('wordDisplay').querySelectorAll('.answer-slot').forEach(s => {
        if (s.classList.contains('locked')) return;
        if (li < chosen.length) {
            s.textContent = chosen[li];
            s.classList.add('filled');
        } else {
            s.textContent = '';
            s.classList.remove('filled');
        }
        li++;
    });
    const low = state.time <= 0 ? ' zero' : (state.time <= 10 ? ' low' : '');
    const label = state.mode === 'practice'
        ? `Slovo ${state.wordIdx + 1} · ${practiceLevel().label}`
        : `Slovo ${state.wordIdx + 1}/${WORDS_PER_DAY}`;
    $('progress').innerHTML = `<div class="gp-headline">${label}</div><div class="gp-timer${low}">${state.time}<span class="gp-timer-unit">s</span></div>`;
    // zbývající čas 0–1 pro lištu nahoře (délka i barva, viz .time-bar)
    $('game').style.setProperty('--t', state.time / START_TIME);
}

/* ---------------- časovač ---------------- */

function startTimer() {
    clearInterval(state.timer);
    updateUI();
    state.timer = setInterval(() => {
        state.time--;
        if (state.time <= 0) {
            clearInterval(state.timer);
            state.time = 0;
            updateUI();
            handleTimeout();
            return;
        }
        if (state.time <= 3) haptic('tick');
        updateUI();
        saveDayProgress();
    }, 1000);
}

function animateTimerUp(from) {
    clearInterval(state.timer);
    const to = START_TIME;
    state.time = from;
    const steps = to - from;
    if (steps <= 0) { state.time = to; startTimer(); return; }
    let current = from;
    const iv = setInterval(() => {
        current++;
        state.time = current;
        updateUI();
        if (current >= to) { clearInterval(iv); startTimer(); }
    }, Math.max(12, Math.floor(500 / steps)));
}

function saveDayProgress() {
    if (state.mode !== 'daily' || !persist.day) return;
    persist.day.wordIdx = state.wordIdx;
    persist.day.marks = state.marks.slice();
    persist.day.time = state.time;
    savePersist();
}

/* ---------------- pauza ---------------- */

function pauseGame() {
    if (state.mode !== 'daily' && state.mode !== 'practice') return;
    if (!$('game').classList.contains('active') || state.processing) return;
    clearInterval(state.timer);
    $('pauseOverlay').classList.add('active');
}

function resumeGame() {
    $('pauseOverlay').classList.remove('active');
    startTimer();
}

// Křížek ve hře: trénink rovnou skončí, denní výzva se nejdřív zeptá.
function exitGame() {
    if (state.mode === 'practice') return exitPractice();
    openQuit();
}

// Ukončení denní výzvy je nevratné (dnešek už nejde dohrát), proto potvrzení.
// Čas mezitím stojí; „Hrát dál" i zavření sheetu jiným způsobem ho rozjede.
function openQuit() {
    if (state.mode !== 'daily' || state.processing) return;   // mezi slovy chvíli počkat
    clearInterval(state.timer);
    const left = WORDS_PER_DAY - state.marks.length;
    $('quitText').textContent = (left === 1
        ? 'Poslední slovo se ti započítá jako neuhodnuté.'
        : `${plural(left, '', `Zbývající ${left} slova se ti započítají`, `Zbývajících ${left} slov se ti započítá`)} jako neuhodnutá.`)
        + ' Dnešek už pak nepůjde dohrát.';
    $('quitModal').onclose = () => { if (!state.quitting) startTimer(); };
    openModal('quitModal');
}

// Zbylá slova dne jako neuhodnutá a rovnou výsledek, jako by den doběhl.
function quitDaily() {
    if (state.mode !== 'daily' || !persist.day) return;
    state.quitting = true;
    closeModal();
    state.quitting = false;
    state.gen++;                                          // zahodit naplánované kroky kola
    clearInterval(state.timer);
    while (state.marks.length < WORDS_PER_DAY) state.marks.push(false);
    state.wordIdx = WORDS_PER_DAY;
    state.solved = state.marks.filter(Boolean).length;
    state.processing = false;
    updateGameGrid();
    saveDayProgress();
    finishDay();
}

function exitPractice() {
    if (state.mode !== 'practice') return;
    state.gen++;
    clearInterval(state.timer);
    clearTimeout(state.nextTimer);
    state.nextTimer = null;
    hideWordDone();
    closeModal();
    state.processing = false;
    showWelcome();
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
});

/* ---------------- konec dne + výsledek ---------------- */

function finishDay() {
    clearInterval(state.timer);
    const perfect = state.marks.length === WORDS_PER_DAY && state.marks.every(Boolean);
    persist.day.done = true;
    persist.day.perfect = perfect;
    persist.day.marks = state.marks.slice();
    persist.day.realTopPct = persist.day.realTopPct ?? null;
    persist.attempts++;
    persist.results[persist.day.dayIdx] = state.marks.filter(Boolean).length;
    if (perfect) {
        persist.wins++;
        const y = new Date(); y.setDate(y.getDate() - 1);
        const yesterday = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
        persist.streak = (persist.lastWinDate === yesterday) ? persist.streak + 1 : 1;
        persist.bestStreak = Math.max(persist.bestStreak, persist.streak);
        persist.lastWinDate = todayStr();
    } else {
        persist.streak = 0;
    }
    savePersist();
    showResult(false);
    refreshRealPercentile(); // dozdobí % v pozadí, jakmile (a pokud) dorazí z backendu
}

/* ---------------- skutečný percentil (volitelný backend) ---------------- */

async function fetchRealPercentile(day, score) {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
        const res = await fetch(API_BASE + '/api/result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ day, score, clientId: persist.clientId, playedOn: todayStr() }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const data = await res.json();
        return (data && data.real) ? data : null;
    } catch (e) {
        return null; // offline, timeout, nenasazený backend… vždy potichu spadnout na statický odhad
    }
}

async function refreshRealPercentile() {
    const day = persist.day;
    if (!day) return;
    const dayNum = day.dayIdx + 1;
    const survived = day.marks.filter(Boolean).length;
    const real = await fetchRealPercentile(dayNum, survived);
    if (!real || persist.day !== day) return; // mezitím mohl začít další den
    persist.day.realTopPct = real.topPct;
    savePersist();
    if ($('result').classList.contains('active')) {
        setEmojiText($('percentile'), formatRealPercentileText(real.topPct));
    }
}

function restoreFinishedDay() {
    // obnova stavu pro zobrazení výsledku už odehraného dneška
    state.mode = 'daily';
    state.marks = persist.day.marks.slice();
    state.solved = state.marks.filter(Boolean).length;
}

// Statický odhad — použije se, dokud nedorazí (nebo není nasazený) skutečný
// percentil z backendu. Založeno na typickém rozložení skóre u podobných her.
function getPercentileText(survived) {
    if (survived === 20) return 'Top 1 % hráčů dneška 👑';
    if (survived === 19) return 'Top 2 % hráčů dneška 🏆';
    if (survived === 18) return 'Top 3 % hráčů dneška 🏆';
    if (survived === 17) return 'Top 5 % hráčů dneška 🏆';
    if (survived >= 15) return 'Top 10 % hráčů dneška 🏅';
    if (survived >= 13) return 'Top 20 % hráčů dneška 🏅';
    if (survived >= 9) return 'Top 50 % hráčů dneška 🏅';
    return 'Dnes bez trofeje 💔';
}

// Skutečný percentil spočítaný backendem ze skutečných výsledků dneška.
function formatRealPercentileText(topPct) {
    if (topPct <= 1) return 'Top 1 % hráčů dneška 👑';
    if (topPct <= 50) {
        const emoji = topPct <= 5 ? '🏆' : '🏅';
        return `Top ${topPct} % hráčů dneška ${emoji}`;
    }
    return 'Dnes bez trofeje 💔';
}

function percentileDisplayText(survived, realTopPct) {
    return (typeof realTopPct === 'number') ? formatRealPercentileText(realTopPct) : getPercentileText(survived);
}

// Jen denní výzva — trénink běží pořád dál a výsledkovou obrazovku nemá.
function showResult(instant) {
    clearInterval(state.timer);
    const survived = state.solved;
    const perfect = survived === WORDS_PER_DAY;

    placeGameGrid('result');
    $('gameGrid').style.display = 'grid';
    if (instant) { renderGameGrid(); }

    showScreen('result');

    $('winBanner').innerHTML = '';
    $('survivedCount').textContent = perfect
        ? 'Máš všech 20 slov!'
        : `Máš ${survived} z 20 slov!`;
    setEmojiText($('percentile'), percentileDisplayText(survived, persist.day.realTopPct));
    const dayNum = persist.day.dayIdx + 1;
    const nextNum = (persist.day.dayIdx + 1) % TOTAL_LEVELS + 1;
    setEmojiText($('progressLine'), perfect
        ? `🔓 Odkryto ${fmtNum(uncoveredCount())}/${fmtNum(TOTAL_WORDS)} slov.\nZítra tě čeká den ${nextNum}!`
        : `Den ${dayNum} ti utekl — zítra čeká den ${nextNum}, nová slova!`);
    updateNotifyPrompt();
    renderStreakNudge();

    startCountdown();
    animateResultReveal(perfect, instant);
}

// Sérii lidi chrání — a je to jediná věc, o kterou tu můžou reálně přijít.
// Proto se o účtu ozveme až ve chvíli, kdy má série cenu, ne v nastavení.
const NUDGE_AT = [3, 7, 14, 30, 60, 100, 200, 365];

function renderStreakNudge() {
    const box = $('streakNudge');
    box.style.display = 'none';
    box.innerHTML = '';
    const s = persist.streak;
    if (!auth.enabled || auth.user || !NUDGE_AT.includes(s) || persist.nudgedAt === s) return;
    persist.nudgedAt = s;
    savePersist();
    box.appendChild(setEmojiText(el('p'), `🔥 ${fmtNum(s)} dní v řadě — a celá série žije jen v tomhle zařízení.`));
    const b = el('button', 'btn btn-primary', 'Uložit sérii k účtu');
    b.type = 'button';
    b.onclick = () => showProfile();
    box.appendChild(b);
    box.style.display = 'block';
}

function plural(n, one, few, many) {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
}

let revealTimeouts = [];
function animateResultReveal(perfect, instant) {
    revealTimeouts.forEach(clearTimeout);
    revealTimeouts = [];
    const items = [...$$('#result .reveal-item')].filter(el => {
        if (el.id === 'winBanner') return false;
        const empty = !el.textContent.trim() && !el.querySelector('button');
        return !empty && el.style.display !== 'none';
    });
    if (instant) {
        items.forEach(el => el.classList.add('show'));
        return;
    }
    items.forEach(el => el.classList.remove('show'));
    items.forEach((el, i) => {
        revealTimeouts.push(setTimeout(() => el.classList.add('show'), 250 + i * 350));
    });
    if (perfect) revealTimeouts.push(setTimeout(() => { haptic('win'); playWinSound(); launchConfetti(); }, 400));
}

/* ---------------- konfety (perfektní den) ---------------- */

let confettiRaf = null;
function stopConfetti() {
    if (confettiRaf) cancelAnimationFrame(confettiRaf);
    confettiRaf = null;
    $('confetti').classList.remove('on');
}

function launchConfetti() {
    const canvas = $('confetti');
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    canvas.classList.add('on');

    // barvy konfet určuje vzhled přes --confetti (mezerou oddělené)
    const themed = getComputedStyle(document.documentElement).getPropertyValue('--confetti').trim();
    const colors = themed ? themed.split(/\s+/) : ['#2e9e5b', '#4169f1', '#f59e0b', '#e0524a', '#9b59b6'];
    const parts = [];
    for (let i = 0; i < 140; i++) {
        parts.push({
            x: Math.random() * innerWidth,
            y: -20 - Math.random() * innerHeight * 0.4,
            w: 6 + Math.random() * 6,
            h: 8 + Math.random() * 8,
            vy: 2 + Math.random() * 3,
            vx: -1.2 + Math.random() * 2.4,
            rot: Math.random() * Math.PI,
            vr: -0.12 + Math.random() * 0.24,
            color: colors[i % colors.length],
        });
    }
    const start = performance.now();
    function frame(now) {
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        let alive = false;
        for (const p of parts) {
            p.x += p.vx; p.y += p.vy; p.rot += p.vr;
            if (p.y < innerHeight + 30) alive = true;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
        if (alive && now - start < 6000) {
            confettiRaf = requestAnimationFrame(frame);
        } else {
            stopConfetti();
        }
    }
    confettiRaf = requestAnimationFrame(frame);
}

/* ---------------- odpočet ---------------- */

function startCountdown() {
    clearInterval(countdownInterval);
    function update() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setHours(24, 0, 0, 0);
        const diff = tomorrow - now;
        if (diff <= 0) { clearInterval(countdownInterval); showWelcome(); return; }
        const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
        const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
        $('countdown').textContent = `Další výzva za ${h}:${m}:${s}`;
    }
    update();
    countdownInterval = setInterval(update, 1000);
}

/* ---------------- sdílení ---------------- */

function buildEmojiGrid() {
    const marks = persist.day ? persist.day.marks : [];
    let out = '';
    for (let i = 0; i < WORDS_PER_DAY; i++) {
        out += marks[i] ? '🟩' : '🟥';
        if (i % 5 === 4 && i !== WORDS_PER_DAY - 1) out += '\n';
    }
    return out;
}

function getTrophyShareLine(survived) {
    const realTopPct = persist.day ? persist.day.realTopPct : null;
    const text = percentileDisplayText(survived, realTopPct);
    if (text.includes('bez trofeje')) return null;
    const clean = text.replace(/[\s\p{Extended_Pictographic}️]+$/u, '');
    return '🏆 ' + clean;
}

function buildShareMessage() {
    const survived = (persist.day && persist.day.marks) ? persist.day.marks.filter(Boolean).length : 0;
    const dayNum = (persist.day ? persist.day.dayIdx : dayIndex()) + 1;
    const grid = buildEmojiGrid();
    let msg = `⏳ 20 slov — den #${dayNum}\n\n🔥 Získáno ${survived}/20 slov`;
    if (grid) msg += `\n\n${grid}`;
    const trophy = getTrophyShareLine(survived);
    if (trophy) msg += `\n\n${trophy}`;
    msg += `\n\n🫵 Překonáš mě?`;
    msg += `\n\n${siteUrl()}`;
    return msg;
}

function copyFallback(msg, blocked) {
    const note = blocked
        ? 'Zkopírováno! (Nativní sdílení tu prohlížeč blokuje)'
        : 'Zkopírováno do schránky!';
    navigator.clipboard?.writeText(msg).then(() => showToast(note)).catch(() => alert(msg));
}

function shareText(msg) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        ('ontouchstart' in window && window.innerWidth < 768);
    if (isMobile && navigator.share) {
        // Musí běžet přímo v gestu uživatele, jinak iOS sheet neotevře.
        navigator.share({ text: msg }).catch(err => {
            if (err && err.name === 'AbortError') return; // uživatel jen zavřel sheet
            // NotAllowedError = web-share blokované (např. sandboxovaný iframe)
            copyFallback(msg, err && err.name === 'NotAllowedError');
        });
    } else {
        copyFallback(msg, false);
    }
}

function shareScore() { shareText(buildShareMessage()); }

/* ---------------- web push: připomínka dalšího dne ---------------- */

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Na iOS Push funguje jen z nainstalované PWA (Add to Home Screen), ne z karty
// Safari — proto se tam nejdřív nabídne instalace, tlačítko notifikací přijde
// na řadu až po ní. Jinde (Android/desktop) jde rovnou žádost o oprávnění.
function updateNotifyPrompt() {
    const banner = $('a2hsBanner');
    const notifyBtn = $('notifyBtn');
    banner.style.display = 'none';
    notifyBtn.style.display = 'none';
    if (!VAPID_PUBLIC_KEY) return;

    if (IS_IOS && !IS_STANDALONE) {
        if (!persist.a2hsPromptDismissed) banner.style.display = 'block';
        return;
    }
    if ('Notification' in window && 'PushManager' in window && Notification.permission === 'default') {
        notifyBtn.style.display = 'flex';
    }
}

function dismissA2hs() {
    persist.a2hsPromptDismissed = true;
    savePersist();
    $('a2hsBanner').style.display = 'none';
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from([...atob(base64)].map(c => c.charCodeAt(0)));
}

async function enableNotifications() {
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        const { endpoint, keys } = sub.toJSON();
        await fetch(API_BASE + '/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: persist.clientId, endpoint, keys }),
        });
        showToast('Upozornění zapnuto!');
    } catch (e) {
        // tichý fail — notifikace jsou čistě volitelné vylepšení
    }
    $('notifyBtn').style.display = 'none';
}

/* ---------------- sbírka slov ---------------- */

function showCollection() {
    $('collectionCount').textContent = `${fmtNum(uncoveredCount())}/${fmtNum(TOTAL_WORDS)}`;
    const list = $('collectionList');
    list.innerHTML = '';
    const today = dayIndex();
    for (let lvl = 0; lvl < TOTAL_LEVELS; lvl++) {
        const li = document.createElement('li');
        li.className = 'archive-item';
        const score = persist.results[lvl];
        const played = score !== undefined;
        const current = lvl === today;
        const label = document.createElement('span');
        label.className = 'archive-date';
        label.textContent = `Den ${lvl + 1}`;
        const badge = document.createElement('span');
        badge.className = 'archive-score';
        if (played) {
            badge.textContent = `${score === WORDS_PER_DAY ? '✓' : '·'} ${score} ${plural(score, 'slovo', 'slova', 'slov')}`;
            const words = document.createElement('div');
            words.className = 'archive-words';
            dayWords(lvl).forEach(w => {
                const s = document.createElement('span');
                s.textContent = w;
                words.appendChild(s);
            });
            li.append(label, badge, words);
            li.onclick = () => li.classList.toggle('open');
        } else {
            badge.classList.add('not-played');
            setEmojiText(badge, current ? 'dnes' : '🔒');
            li.classList.toggle('locked', !current);
            li.append(label, badge);
            // Dny se drží kalendáře: minulé už nedohraješ, budoucí ještě nepřišly.
            if (!current) li.onclick = () => showToast(lvl < today
                ? 'Tenhle den ti utekl — vrátí se za rok.'
                : 'Ještě nepřišel na řadu!');
        }
        list.appendChild(li);
    }
    openModal('collectionModal');
    // aktuální den nascrollovat do záběru
    const cur = list.children[today];
    if (cur) cur.scrollIntoView({ block: 'center' });
}

/* ---------------- zpětná vazba ---------------- */

function openFeedbackModal() {
    $('feedbackForm').style.display = 'flex';
    $('feedbackSuccess').style.display = 'none';
    $('feedbackError').style.display = 'none';
    openModal('feedbackModal');
}

/* ---------------- sheety ---------------- */

// Sheet se otevírá i zavírá animací. Zavření ho nechá sjet dolů z místa, kde
// právě je (i z půlky tahu prstem nebo otevírání), pozadí se rozplyne a teprve
// pak sheet zmizí — nikdy jen neblikne pryč.
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
// Čím se naposledy ovládalo — podle toho se po zavření sheetu vrací fokus.
let lastInput = 'pointer';
document.addEventListener('pointerdown', () => { lastInput = 'pointer'; }, true);
document.addEventListener('keydown', () => { lastInput = 'key'; }, true);
const SHEET_CLOSE_MS = 300;

function openModal(id) {
    const modal = $(id);
    modal.classList.remove('closing');                    // otevřený během zavírání zůstane
    modal.querySelector('.modal-content').style.cssText = '';
    modal.classList.add('active');
    // Fokus na sheet samotný (role=dialog), ne na tlačítko — čtečka se ocitne
    // uvnitř, ale nic se nerozsvítí; Zavřít ukáže až Tab. Na původní místo se
    // fokus vrací jen klávesnici: po klepnutí by na kartě zůstal rámeček.
    if (!modal.contains(document.activeElement)) modal.opener = lastInput === 'key' ? document.activeElement : null;
    modal.querySelector('.modal-content').focus({ preventScroll: true });
}

function closeSheet(modal) {
    if (!modal.classList.contains('active') || modal.classList.contains('closing')) return;
    const sheet = modal.querySelector('.modal-content');
    modal.classList.add('closing');
    // co má sheet po zavření udělat (quitModal rozjede čas), ať se zavře jakkoli
    const onclose = modal.onclose;
    modal.onclose = null;
    if (onclose) onclose();
    const finish = () => {
        if (!modal.classList.contains('closing')) return; // mezitím se znovu otevřel
        modal.classList.remove('active', 'closing');
        sheet.style.cssText = '';
        if (modal.opener && modal.opener.isConnected) modal.opener.focus({ preventScroll: true });
        modal.opener = null;
    };
    if (REDUCED_MOTION.matches) return finish();
    slideDown(sheet, SHEET_CLOSE_MS);
    // časovač, ne transitionend — ten probublává i z přechodů uvnitř sheetu
    setTimeout(finish, SHEET_CLOSE_MS);
}

// Sjede prvkem dolů z místa, kde právě je (i z půlky tahu nebo otevírání).
function slideDown(el, ms) {
    const from = getComputedStyle(el).transform;
    el.style.animation = 'none';
    el.style.transition = 'none';
    el.style.transform = from;
    el.getBoundingClientRect();                           // zapsat výchozí polohu, než se rozjede
    el.style.transition = `transform ${ms}ms cubic-bezier(.32,.72,0,1)`;
    el.style.transform = 'translateY(110%)';
}

function closeModal() {
    $$('.modal.active').forEach(closeSheet);
}

function submitFeedback(e) {
    e.preventDefault();
    const form = $('feedbackForm');
    fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
    }).then(r => {
        if (!r.ok) throw new Error();
        form.reset();
        form.style.display = 'none';
        $('feedbackSuccess').style.display = 'block';
    }).catch(() => {
        $('feedbackError').style.display = 'block';
    });
}

document.addEventListener('pointerdown', e => {
    const modal = e.target.closest('.modal');
    if (modal && e.target === modal) closeModal();
});

// Stažení sheetu dolů ho zavře, jak je zvykem na iOS. Tahá se jen za hlavičku
// (úchyt) nebo za obsah, který už je nascrollovaný nahoře — jinak by tah
// kradl scrollování seznamu.
(function sheetDrag() {
    let box = null, y0 = 0, dy = 0;
    document.addEventListener('pointerdown', e => {
        const content = e.target.closest('.modal.active .modal-content');
        if (!content || e.target.closest('input, textarea, button, a')) return;
        const fromHeader = !!e.target.closest('.modal-header');
        if (!fromHeader && content.scrollTop > 0) return;
        box = content; y0 = e.clientY; dy = 0;
        box.style.transition = 'none';
    });
    document.addEventListener('pointermove', e => {
        if (!box) return;
        dy = Math.max(0, e.clientY - y0);
        box.style.transform = dy ? `translateY(${dy}px)` : '';
    });
    const end = () => {
        if (!box) return;
        const el = box; box = null;
        // Dost daleko → sheet dojede dolů z místa, kam ho prst dotáhl; jinak se vrátí.
        if (dy > Math.min(120, el.offsetHeight * 0.25)) return closeModal();
        el.style.transition = 'transform .25s cubic-bezier(.32,.72,0,1)';
        el.style.transform = '';
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
})();

// Mezihra, ovládání prstem (jako příběhy na Instagramu):
//  - podržení kdekoli na panelu mimo tlačítka odpočet na chvíli zastaví —
//    dlouhý význam jde dočíst; puštěním běží dál,
//  - na tlačítku Další se čas zastaví hned, ať nedoběhne pod prstem; puštěním
//    na tlačítku se jde dál (běžné klepnutí), sjetím z něj odpočet pokračuje,
//  - krátké klepnutí na kartu otevře detail slova, jinam = hned další slovo.
// Puštění po podržení mimo Další se nepočítá jako klepnutí, i kdyby z něj
// prohlížeč udělal click.
const HOLD_MS = 250;
let wdPress = null;
$('wordDoneOverlay').addEventListener('pointerdown', e => {
    const onNext = !!e.target.closest('#wdNextBtn');
    if (!onNext && (e.target.closest('button, a') || !e.target.closest('.wd-panel'))) return;
    const press = wdPress = { onNext, long: false, paused: onNext && pauseCountdown() };
    press.timer = setTimeout(() => {
        press.long = true;
        if (!press.paused) press.paused = pauseCountdown();
        if (!press.paused) return;
        $('wdNextBtn').classList.add('paused');
        $('wordDoneOverlay').classList.add('holding');
        haptic('tap');
    }, HOLD_MS);
});
const wdRelease = (e) => {
    if (!wdPress) return;
    clearTimeout(wdPress.timer);
    // Na Další se puštěním jde dál jen na tlačítku samém; sjetí z něj (i puštění
    // nad hrou, kam by prohlížeč poslal click) je zrušení.
    // Cíl pointerupu u dotyku nepomůže (prst má implicitní capture na tlačítku),
    // proto se ptá, co je opravdu pod prstem.
    const under = e && e.type === 'pointerup' && document.elementFromPoint(e.clientX, e.clientY);
    const offNext = wdPress.onNext && !(under && under.closest('#wdNextBtn'));
    state.wdSkipClick = (wdPress.long && !wdPress.onNext) || offNext;
    wdPress = null;
    $('wordDoneOverlay').classList.remove('holding');
    resumeCountdown();
};
document.addEventListener('pointerup', wdRelease);
document.addEventListener('pointercancel', wdRelease);
$('wordDoneOverlay').addEventListener('click', e => {
    if (state.wdSkipClick) { state.wdSkipClick = false; return; }
    if (e.target.closest('button, a')) return;
    if (e.target.closest('.wd-card')) return openDefs();   // celý význam a ostatní kandidáti
    nextWord();
});
// Podržení nesmí otevřít kontextové menu (Android, pravé tlačítko myši).
$('wordDoneOverlay').addEventListener('contextmenu', e => e.preventDefault());

// Na pozadí se odpočet zruší, ať hráči slovo neuteče.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) holdWordDone();
});

/* ---------------- klávesnice ---------------- */

const STRIP = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

document.onkeydown = e => {
    if (e.key === 'Escape') { closeModal(); return; }
    // Mezihra: Enter nebo mezerník = další slovo (když fokus nestojí na tlačítku).
    if ($('wordDoneOverlay').classList.contains('active') && !document.querySelector('.modal.active') &&
        (e.key === 'Enter' || e.key === ' ') && !e.target.closest('button, a, input, textarea')) {
        e.preventDefault();
        return nextWord();
    }
    if (
        !$('game').classList.contains('active') ||
        state.processing ||
        document.querySelector('.modal.active') ||
        $('wordDoneOverlay').classList.contains('active') ||
        $('pauseOverlay').classList.contains('active')
    ) return;

    if (state.incorrectTimeout && e.key !== 'Enter') {
        clearIncorrectState();
        updateUI();
    }

    if (e.key === 'Backspace' && state.selected.length > 0) {
        e.preventDefault();
        const idx = state.selected.pop();
        const tile = $('letterRow').querySelector(`.letter[data-index="${idx}"]`);
        if (tile) tile.classList.remove('selected');
        updateUI();
        return;
    }

    if (e.key === 'Enter' && state.selected.length === state.letters.length) {
        e.preventDefault();
        return checkWord();
    }

    if (e.key === 'Shift') { shuffleLetters(); return; }

    if (e.key.length !== 1 || state.selected.length >= state.letters.length) return;
    const key = e.key.toLowerCase();
    // přesná shoda (č, š, ž…), pak shoda bez diakritiky (e → é/ě)
    let tile = [...$$('#letterRow .letter')].find(l =>
        !state.selected.includes(+l.dataset.index) && state.letters[+l.dataset.index] === key
    );
    if (!tile) {
        tile = [...$$('#letterRow .letter')].find(l =>
            !state.selected.includes(+l.dataset.index) && STRIP(state.letters[+l.dataset.index]) === STRIP(key)
        );
    }
    if (tile) {
        selectLetter(tile);
        if (state.selected.length === state.letters.length) checkWord();
    }
};

document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

/* ---------------- start ---------------- */

(function init() {
    // rozehraný, ale nedokončený den z minulosti zahodit (hraje se znovu)
    if (persist.day && !persist.day.done && persist.day.date !== todayStr()) {
        persist.day = null;
        savePersist();
    }
    addHapticOverlays();
    registerServiceWorker();
    showWelcome();
})();
