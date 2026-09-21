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
const PRACTICE_GAP = 5;   // s — mezihra po slově v tréninku (slovo + význam)
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
    const dayNum = dayIndex() + 1;
    $('welcomeDate').textContent = `Den ${dayNum}/${TOTAL_LEVELS} · ${fmtNum(uncoveredCount())}/${fmtNum(TOTAL_WORDS)} slov`;
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

function showWordDone(word, gen) {
    if (state.gen !== gen) return;
    clearInterval(state.timer);
    clearInterval(state.nextTimer);
    state.wdWord = word;
    state.wdPaused = false;
    state.wdLeft = PRACTICE_GAP;
    renderWordDone(word);
    $('wordDoneOverlay').classList.add('active');
    $('wordDoneOverlay').classList.remove('wd-paused');
    if (!defCache.has(word)) {
        apiGet(defsUrl(word)).then(d => {
            if (!d || !d.defs) return;
            defCache.set(word, d.defs[word] || null);
            if (state.gen === gen && state.wdWord === word) renderWordDone(word);
        });
    }
    renderWdCount();
    state.nextTimer = setInterval(() => {
        if (state.gen !== gen) { clearInterval(state.nextTimer); state.nextTimer = null; return; }
        if (state.wdPaused) return;
        if (--state.wdLeft > 0) return renderWdCount();
        clearInterval(state.nextTimer);
        state.nextTimer = null;
        hideWordDone();
        loadWord();
    }, 1000);
    prefetchDefs();
}

function hideWordDone() {
    $('wordDoneOverlay').classList.remove('active', 'wd-paused');
}

function renderWdCount() {
    $('wdCount').textContent = state.wdPaused ? 'Klepnutím pokračuješ' : `Další slovo za ${state.wdLeft} s`;
}

function renderWordDone(word) {
    $('wdWord').textContent = word;
    const def = defCache.get(word);
    const card = $('wdCard');
    card.innerHTML = '';
    const text = document.createElement('p');
    text.className = 'wd-text';
    if (def) {
        card.classList.remove('wd-card--empty');
        text.textContent = def.text;                     // cizí text vždy přes textContent
        const meta = document.createElement('div');
        meta.className = 'wd-meta';
        meta.append(authorEl(def.author), voteBtn(def));
        card.append(text, meta);
        $('wdMoreBtn').textContent = 'Významy a přidat vlastní';
    } else {
        card.classList.add('wd-card--empty');
        text.textContent = 'Pro toto slovo zatím nemáme význam – buď první, kdo ho vytvoří.';
        card.append(text);
        $('wdMoreBtn').textContent = 'Přidat význam';
    }
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
    b.textContent = `👍 ${def.votes}`;
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
    btn.textContent = `👍 ${def.votes}`;
    btn.classList.toggle('voted', !!def.voted);
}

/* ---------------- modal se všemi významy ---------------- */

function openDefs(e) {
    if (e) e.stopPropagation();
    pauseWordDone(true);                                  // session se pozastaví, nezabíjí
    const word = state.wdWord;
    $('defsTitle').textContent = word || 'Významy';
    $('defsError').style.display = 'none';
    $('defsText').value = '';
    $('defsList').innerHTML = '';
    $('defsModal').classList.add('active');
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
    $('defsModal').classList.remove('active');
    pauseWordDone(false);                                 // a zase se rozjede
}

function pauseWordDone(paused) {
    if (!$('wordDoneOverlay').classList.contains('active')) return;
    state.wdPaused = paused;
    $('wordDoneOverlay').classList.toggle('wd-paused', paused);
    renderWdCount();
}

async function loadDefsList(word) {
    const list = $('defsList');
    const data = await apiGet(`/api/defs/word?w=${encodeURIComponent(word)}`);
    if (state.wdWord !== word) return;
    list.innerHTML = '';
    const defs = (data && data.defs) || [];
    if (!defs.length) {
        const p = document.createElement('li');
        p.className = 'def-empty';
        p.textContent = data
            ? 'Zatím tu není žádný význam. Buď první!'
            : 'Významy se teď nepodařilo načíst.';
        list.appendChild(p);
        return;
    }
    defs.forEach(d => list.appendChild(defItem(d)));
}

function defItem(d) {
    const li = document.createElement('li');
    li.className = 'def-item' + (d.mine ? ' mine' : '');
    const p = document.createElement('p');
    p.className = 'wd-text';
    p.textContent = d.text;
    const meta = document.createElement('div');
    meta.className = 'wd-meta';
    meta.append(authorEl(d.author), voteBtn(d));
    li.append(p, meta);
    if (d.mine) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'def-report';
        edit.textContent = 'Upravit';
        edit.onclick = () => editDef(d, li, p);
        li.appendChild(edit);
    } else if (auth.user) {
        const rep = document.createElement('button');
        rep.type = 'button';
        rep.className = 'def-report';
        rep.textContent = 'Nahlásit';
        rep.onclick = () => reportDef(d, li);
        li.appendChild(rep);
    }
    return li;
}

// Autor smí svůj význam upravit. Když už má hlasy, úprava je smaže — jinak by
// šlo vyhlasovat neškodnou větu a pak ji přepsat.
function editDef(d, li, textEl) {
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
        defCache.delete(state.wdWord);
        loadDefsList(state.wdWord);
        renderWordDone(state.wdWord);
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
    renderWordDone(word);
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

function renderAccount() {
    const section = $('accountSection');
    const box = $('accountBox');
    box.innerHTML = '';
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
    const del = el('button', 'btn-tertiary', 'Smazat účet');
    del.onclick = async () => {
        if (!confirm('Opravdu smazat účet? Tvoje významy zůstanou ostatním, jen se z nich sundá tvoje jméno.')) return;
        await apiPost('/api/me/delete', {});
        auth.user = null;
        persist.nick = '';
        savePersist();
        renderProfile();
        showToast('Účet smazán.');
    };
    box.append(out, del);
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
        [fmtNum(persist.streak), 'dní v řadě'],
        [fmtNum(days), 'odehraných dní'],
        [fmtNum(words), 'slov v denní výzvě'],
        [pct + ' %', 'úspěšnost'],
        [fmtNum(persist.practiceWords), 'uhodnutých slov v tréninku', 'stat-tile--wide'],
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

async function loadMyDefs() {
    const box = $('profileDefs');
    box.textContent = 'Načítám…';
    const data = await apiGet('/api/defs/mine');
    const defs = data && data.defs;
    if (!defs) {
        box.textContent = 'Významy se teď nepodařilo načíst.';
        return;
    }
    if (!defs.length) {
        box.textContent = 'Zatím žádný. V tréninku se ti po každém slově nabídne, ať nějaký přidáš.';
        return;
    }
    box.classList.remove('empty-card');
    box.textContent = '';
    const list = document.createElement('ul');
    list.className = 'defs-list';
    for (const d of defs) {
        const li = document.createElement('li');
        li.className = 'def-item mine';
        const w = document.createElement('div');
        w.className = 'def-word';
        w.textContent = d.word;
        const p = document.createElement('p');
        p.className = 'wd-text';
        p.textContent = d.text;
        const meta = document.createElement('div');
        meta.className = 'wd-meta';
        const v = document.createElement('span');
        v.textContent = `👍 ${d.votes}`;
        meta.appendChild(v);
        li.append(w, p, meta);
        list.appendChild(li);
    }
    box.appendChild(list);
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
    $('closeGameBtn').style.display = 'none';
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

function startPracticeGame() {
    const pool = PRACTICE_WORDS;
    state.gen++;
    state.mode = 'practice';
    $('closeGameBtn').style.display = 'flex';
    state.pool = pool;
    state.practiceQueue = shuffleCopy(pool);
    state.words = [];
    state.wordIdx = 0;
    state.marks = [];
    state.solved = 0;
    state.practiceCount = 0;
    clearInterval(state.nextTimer);
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
    setTimeout(() => {
        if (state.gen !== genOk) return;
        $('wordDisplay').classList.remove('found');
        $('wordDisplay').style.cssText = '';
        if (state.mode === 'practice') return showWordDone(target, genOk);
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

    state.wordIdx++;
    state.marks.push(false);
    updateGameGrid(state.marks.length - 1);
    saveDayProgress();

    const revealDone = slots.length * stagger + 340;
    // Trénink neskončí — jen se počká, ať si hráč nestihnuté slovo přečte,
    // a další naběhne samo. Skončí se křížkem vpravo nahoře.
    // V tréninku se po odhalení slova rovnou otevře mezihra, která si odpočet
    // řídí sama; v denní výzvě zůstává původní krátká pauza.
    const hold = state.mode === 'practice' ? 500 : 850;
    if (state.mode === 'practice') state.practiceCount = 0;

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
        if (state.mode === 'practice') return showWordDone(target, gen);
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
        ? `Slovo ${state.wordIdx + 1}`
        : `Slovo ${state.wordIdx + 1}/${WORDS_PER_DAY}`;
    $('progress').innerHTML = `<div class="gp-headline">${label}</div><div class="gp-timer${low}">${state.time}<span class="gp-timer-unit">s</span></div>`;
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

function exitPractice() {
    if (state.mode !== 'practice') return;
    state.gen++;
    clearInterval(state.timer);
    clearInterval(state.nextTimer);
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
        $('percentile').textContent = formatRealPercentileText(real.topPct);
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
    $('percentile').textContent = percentileDisplayText(survived, persist.day.realTopPct);
    const dayNum = persist.day.dayIdx + 1;
    const nextNum = (persist.day.dayIdx + 1) % TOTAL_LEVELS + 1;
    $('progressLine').innerHTML = perfect
        ? `🔓 Odkryto ${fmtNum(uncoveredCount())}/${fmtNum(TOTAL_WORDS)} slov.<br>Zítra tě čeká den ${nextNum}!`
        : `Den ${dayNum} ti utekl — zítra čeká den ${nextNum}, nová slova!`;
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
    box.appendChild(el('p', null, `🔥 ${fmtNum(s)} dní v řadě — a celá série žije jen v tomhle zařízení.`));
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

    const colors = ['#2e9e5b', '#4169f1', '#f59e0b', '#e0524a', '#9b59b6'];
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
            badge.textContent = current ? 'dnes' : '🔒';
            li.classList.toggle('locked', !current);
            li.append(label, badge);
            // Dny se drží kalendáře: minulé už nedohraješ, budoucí ještě nepřišly.
            if (!current) li.onclick = () => showToast(lvl < today
                ? 'Tenhle den ti utekl — vrátí se za rok.'
                : 'Ještě nepřišel na řadu!');
        }
        list.appendChild(li);
    }
    $('collectionModal').classList.add('active');
    // aktuální den nascrollovat do záběru
    const cur = list.children[today];
    if (cur) cur.scrollIntoView({ block: 'center' });
}

/* ---------------- zpětná vazba ---------------- */

function openFeedbackModal() {
    $('feedbackForm').style.display = 'flex';
    $('feedbackSuccess').style.display = 'none';
    $('feedbackError').style.display = 'none';
    $('feedbackModal').classList.add('active');
}

function closeModal() {
    $$('.modal').forEach(m => m.classList.remove('active'));
    pauseWordDone(false);   // trénink pokračuje, i když se zavřelo Escapem nebo klikem vedle
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
        el.style.transition = 'transform .25s cubic-bezier(.32,.72,0,1)';
        el.style.transform = '';
        // Zavírá se buď po dostatečném tahu, nebo po rychlém švihnutí.
        if (dy > Math.min(120, el.offsetHeight * 0.25)) closeModal();
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
})();

// Mezihra: klepnutí kamkoli mimo tlačítka pozastaví a zase rozjede odpočet.
$('wordDoneOverlay').addEventListener('pointerdown', e => {
    if (e.target.closest('button, a')) return;
    pauseWordDone(!state.wdPaused);
});

// Na pozadí se odpočet zastaví, ať hráči slovo neuteče.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseWordDone(true);
});

/* ---------------- klávesnice ---------------- */

const STRIP = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

document.onkeydown = e => {
    if (e.key === 'Escape') { closeModal(); return; }
    if (
        !$('game').classList.contains('active') ||
        state.processing ||
        $('collectionModal').classList.contains('active') ||
        $('feedbackModal').classList.contains('active') ||
        $('defsModal').classList.contains('active') ||
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
