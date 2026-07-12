/* 2000 slov — česká denní slovní hra po vzoru 18words.com
 * Slovník: jen podstatná jména (Wikislovník), seřazená čistě podle frekvence
 * výskytu — obtížnost roste přirozeně tím, jak slova řídnou v běžné řeči.
 * Slož slovo ze všech písmen do 30 s. Všech 20 zelených = postup,
 * jinak den zítra opakuješ. Jeden pokus denně.
 * Trénink čerpá z širšího poolu PRACTICE_WORDS (13 000 slov), denní hra
 * (WORDS) má přesně 2000 slov / 100 dní. */
'use strict';

const START_TIME = 30;
const WORDS_PER_DAY = 20;
const TOTAL_WORDS = WORDS.length;                 // 2000
const TOTAL_LEVELS = TOTAL_WORDS / WORDS_PER_DAY; // 100

const LETTER_RE = /[a-záčďéěíňóřšťúůýž]/;
// hratelná písmena hesla (bez mezer, teček, pomlček — ty jsou ve slotech pevně)
const lettersOf = w => [...w].filter(c => LETTER_RE.test(c)).join('');
const fmtNum = n => n.toLocaleString('cs-CZ');
const STORAGE_KEY = 'slov2000_v2';
const FALLBACK_URL = 'https://agilek.github.io/2000slov/';

// Backend pro skutečné percentily ("Top X % hráčů dneška"). Prázdné = hra
// používá jen statický odhad níže. Po nasazení workeru (worker/README.md)
// sem vlož jeho URL, např. https://slov2000-api.TVUJ-SUBDOMAIN.workers.dev
const API_BASE = 'https://slov2000-api.slov2000.workers.dev';
const API_TIMEOUT_MS = 1500;

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const IS_DESKTOP = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------------- trvalý stav ---------------- */

function defaultPersist() {
    return {
        level: 0,            // počet zvládnutých dnů = index aktuálního dne
        streak: 0,
        bestStreak: 0,
        lastWinDate: null,
        attempts: 0,
        wins: 0,
        kbHintShown: false,
        day: null,           // { date, level, wordIdx, marks, time, done, perfect, realTopPct }
        clientId: genClientId(), // anonymní ID pro leaderboard backend (jen počítadlo, žádná osobní data)
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
        if (raw) return Object.assign(defaultPersist(), JSON.parse(raw));
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

function uncoveredCount() { return Math.min(persist.level * WORDS_PER_DAY, TOTAL_WORDS); }

function dayWords(level) { return WORDS.slice(level * WORDS_PER_DAY, (level + 1) * WORDS_PER_DAY); }

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
    const dayNum = Math.min(persist.level + 1, TOTAL_LEVELS);
    $('welcomeDate').textContent = `Den ${dayNum}/${TOTAL_LEVELS} · ${fmtNum(uncoveredCount())}/${fmtNum(TOTAL_WORDS)} slov`;
    const todayDone = persist.day && persist.day.done && persist.day.date === todayStr();
    $('playBtn').textContent = todayDone ? 'Výsledek' : 'Hrát';
    const retry = !todayDone && persist.attempts > 0;
    $('welcomeRules').innerHTML = persist.level >= TOTAL_LEVELS
        ? `Máš odkryto všech ${fmtNum(TOTAL_WORDS)} slov. 🏆`
        : (retry
            ? 'Zvládni všech 20 slov a postoupíš dál.<br>Jedno nestihneš? Celý den si zítra zopakuješ.'
            : `Zvládni všech 20 slov a odkryj dalších 20<br>z ${fmtNum(TOTAL_WORDS)} nejčastějších českých slov.`);
    showScreen('welcome');
}

function playToday() {
    const today = todayStr();
    if (persist.day && persist.day.done && persist.day.date === today) {
        restoreFinishedDay();
        showResult(true);
        return;
    }
    if (persist.level >= TOTAL_LEVELS) { startPracticeGame(); return; }
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
    state.mode = 'daily';
    state.words = dayWords(persist.level);

    const d = persist.day;
    if (d && !d.done && d.date === today && d.level === persist.level && d.wordIdx < WORDS_PER_DAY) {
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
        persist.day = { date: today, level: persist.level, wordIdx: 0, marks: [], time: START_TIME, done: false, perfect: false };
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
    state.mode = 'practice';
    state.pool = pool;
    state.practiceQueue = shuffleCopy(pool);
    state.words = [];
    state.wordIdx = 0;
    state.marks = [];
    state.solved = 0;
    state.practiceCount = 0;
    state.time = START_TIME;
    stopConfetti();
    placeGameGrid('game');
    showScreen('game');
    loadWord();
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
        el.addEventListener('pointerdown', e => { e.preventDefault(); handleTap(el); });
        row.appendChild(el);
    });
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
    el.classList.add('selected');
    updateUI();
}

function handleTap(el) {
    if (state.processing) return;
    const idx = +el.dataset.index;
    const pos = state.selected.indexOf(idx);
    if (pos !== -1) {
        haptic('tap');
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
    const alts = (typeof ALTS !== 'undefined' && ALTS[target]) || [];
    return alts.some(a => lettersOf(a) === word);
}

function checkWord() {
    if (state.processing) return;
    const word = state.selected.map(i => state.letters[i]).join('');
    const target = state.words[state.wordIdx] || '';

    if (word.length !== state.letters.length || !isAcceptedWord(word, target)) {
        haptic('error');
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
    $('wordDisplay').classList.add('pulse', 'found');
    $('letterRow').classList.add('pulse');
    $$('#letterRow .letter.selected').forEach(l => l.classList.add('correct'));

    state.wordIdx++;
    state.solved++;
    state.marks.push(true);
    if (state.mode === 'practice') state.practiceCount++;
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

    setTimeout(() => {
        $('wordDisplay').classList.remove('found');
        $('wordDisplay').style.cssText = '';
        loadWord();
    }, 750);
}

function handleTimeout() {
    if (state.processing) return;
    state.processing = true;
    haptic('miss');
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

    if (state.mode === 'practice') {
        // Trénink je na přežití — první nestihnuté slovo končí.
        setTimeout(() => showResult(false, target), slots.length * stagger + 1200);
        return;
    }

    state.wordIdx++;
    state.marks.push(false);
    updateGameGrid(state.marks.length - 1);
    saveDayProgress();

    const revealDone = slots.length * stagger + 340;
    const hold = 850;

    setTimeout(() => {
        const els = [wd, ...$$('#letterRow .letter')];
        els.forEach(el => {
            el.style.transition = 'opacity .3s ease-out, transform .3s ease-out';
            el.style.opacity = '0';
            el.style.transform = 'scale(.85)';
        });
    }, revealDone + hold);

    setTimeout(() => {
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
    if (perfect) {
        persist.wins++;
        persist.level++;
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
    if (!API_BASE) return null;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
        const res = await fetch(API_BASE + '/api/result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ day, score, clientId: persist.clientId }),
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
    const dayNum = day.level + 1;
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

function showResult(instant, failedWord) {
    clearInterval(state.timer);
    const isPractice = state.mode === 'practice';
    const survived = state.solved;
    const perfect = !isPractice && survived === WORDS_PER_DAY;

    const grid = $('gameGrid');
    if (!isPractice) {
        placeGameGrid('result');
        grid.style.display = 'grid';
        if (instant) { renderGameGrid(); }
    } else {
        grid.style.display = 'none';
    }

    showScreen('result');

    $('winBanner').innerHTML = '';
    $('failedWord').textContent = isPractice ? (failedWord || '') : '';
    if (isPractice) {
        $('survivedCount').textContent = `${state.practiceCount} ${plural(state.practiceCount, 'slovo', 'slova', 'slov')} v řadě!`;
        $('percentile').textContent = '';
        $('progressLine').textContent = '';
    } else {
        $('survivedCount').textContent = perfect
            ? 'Máš všech 20 slov!'
            : `Máš ${survived} z 20 slov!`;
        $('percentile').textContent = percentileDisplayText(survived, persist.day.realTopPct);
        const dayNum = persist.day.level + 1;
        $('progressLine').textContent = perfect
            ? (persist.level >= TOTAL_LEVELS
                ? `🏆 Odkryto všech ${fmtNum(TOTAL_WORDS)} slov. Neuvěřitelné!`
                : `🔓 Odkryto ${fmtNum(uncoveredCount())}/${fmtNum(TOTAL_WORDS)} slov. Zítra tě čeká den ${dayNum + 1}!`)
            : `Den ${dayNum} si zítra zopakuješ — příště to dáš!`;
    }
    $('shareActions').style.display = isPractice ? 'none' : 'flex';
    $('collectionBtn').style.display = isPractice ? 'none' : 'inline-flex';
    $('practiceBtn').style.display = !isPractice ? 'inline-flex' : 'none';
    $('practiceAgainBtn').style.display = isPractice ? 'inline-flex' : 'none';
    $('backBtn').style.display = isPractice ? 'inline-flex' : 'none';
    $('countdown').style.marginTop = isPractice ? '8px' : '';

    startCountdown();
    animateResultReveal(perfect, instant);
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
    if (perfect) revealTimeouts.push(setTimeout(() => { haptic('win'); launchConfetti(); }, 400));
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

function buildShareMessage(mode) {
    const survived = (persist.day && persist.day.marks) ? persist.day.marks.filter(Boolean).length : 0;
    const dayNum = (persist.day ? persist.day.level : persist.level) + 1;
    const grid = buildEmojiGrid();
    let msg = `⏳ 2000 slov — den #${dayNum}\n\n🔥 Získáno ${survived}/20 slov`;
    if (grid) msg += `\n\n${grid}`;
    if (mode === 'score') {
        const trophy = getTrophyShareLine(survived);
        if (trophy) msg += `\n\n${trophy}`;
    } else {
        msg += `\n\n🫵 Překonáš mě?`;
    }
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

function shareScore() { shareText(buildShareMessage('score')); }
function challengeFriend() { shareText(buildShareMessage('challenge')); }

/* ---------------- sbírka slov ---------------- */

function showCollection() {
    $('collectionCount').textContent = `${fmtNum(uncoveredCount())}/${fmtNum(TOTAL_WORDS)}`;
    const list = $('collectionList');
    list.innerHTML = '';
    for (let lvl = 0; lvl < TOTAL_LEVELS; lvl++) {
        const li = document.createElement('li');
        li.className = 'archive-item';
        const done = lvl < persist.level;
        const current = lvl === persist.level;
        const label = document.createElement('span');
        label.className = 'archive-date';
        label.textContent = `Den ${lvl + 1}`;
        const badge = document.createElement('span');
        badge.className = 'archive-score';
        if (done) {
            badge.textContent = '✓ 20 slov';
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
            if (!current) li.onclick = () => showToast('Nejdřív zvládni předchozí dny!');
        }
        list.appendChild(li);
    }
    $('collectionModal').classList.add('active');
    // aktuální den nascrollovat do záběru
    const cur = list.children[Math.min(persist.level, TOTAL_LEVELS - 1)];
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

/* ---------------- klávesnice ---------------- */

const STRIP = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

document.onkeydown = e => {
    if (e.key === 'Escape') { closeModal(); return; }
    if (
        !$('game').classList.contains('active') ||
        state.processing ||
        $('collectionModal').classList.contains('active') ||
        $('feedbackModal').classList.contains('active') ||
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
    showWelcome();
})();
