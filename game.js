/* 2000 SLOV — denní slovní hra
 * 100 dní × 20 slov. Jedna chyba = den se opakuje. Jeden pokus denně. */
'use strict';

const WORDS_PER_DAY = 20;
const TOTAL_WORDS = WORDS.length;           // 2000
const TOTAL_LEVELS = TOTAL_WORDS / WORDS_PER_DAY; // 100
const STORAGE_KEY = 'slov2000_v1';
const FALLBACK_URL = 'https://agilek.github.io/2000slov/';

/* ---------------- state ---------------- */

const defaultState = () => ({
  level: 0,               // počet dokončených dnů = index aktuálního dne
  attempt: null,          // { date, wordIdx, status: 'playing'|'won'|'lost', failedWord }
  streak: 0,
  bestStreak: 0,
  lastWinDate: null,
  attempts: 0,
  wins: 0,
  lastLostLevel: null,
  seenHelp: false,
});

let state = loadState();
let practice = null;      // { word, tiles, picks } když běží trénink
let round = null;         // { target, tiles: [{ch,used}], picks: [tileIdx] }
let countdownTimer = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* poškozený stav → začínáme znovu */ }
  return defaultState();
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

/* ---------------- utils ---------------- */

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Deterministické zamíchání — všichni mají ve stejný den stejné zadání. */
function scramble(word, seedStr) {
  const chars = [...word];
  const rnd = mulberry32(hashStr(seedStr));
  for (let attempt = 0; attempt < 10; attempt++) {
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    if (chars.join('') !== word) break;
  }
  if (chars.join('') === word && chars.length > 1) chars.push(chars.shift());
  return chars;
}

function dayWords(level) {
  return WORDS.slice(level * WORDS_PER_DAY, (level + 1) * WORDS_PER_DAY);
}

function uncoveredCount() {
  return Math.min(state.level * WORDS_PER_DAY, TOTAL_WORDS);
}

function siteUrl() {
  if (location.protocol.startsWith('http')) return location.origin + location.pathname;
  return FALLBACK_URL;
}

const $ = (id) => document.getElementById(id);

function show(screenId) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = (s.id !== screenId);
}

let toastTimer = null;
function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------------- day/screen routing ---------------- */

function refresh() {
  practice = null;
  $('practice-note').hidden = true;
  const today = todayStr();

  // pokus z jiného dne, který nebyl dohraný → zahodit (den se hraje znovu)
  if (state.attempt && state.attempt.date !== today && state.attempt.status === 'playing') {
    state.attempt = null;
    saveState();
  }

  if (state.level >= TOTAL_LEVELS) { showFinished(); return; }

  if (state.attempt && state.attempt.date === today) {
    if (state.attempt.status === 'playing') { resumeGame(); return; }
    showResult();  // dnes už odehráno (won/lost)
    return;
  }
  showIntro();
}

function showIntro() {
  const dayNum = state.level + 1;
  $('intro-day').textContent = dayNum;
  $('intro-uncovered').textContent = uncoveredCount();
  $('intro-bar').style.width = (uncoveredCount() / TOTAL_WORDS * 100) + '%';
  const isRetry = state.attempts > 0 && state.lastLostLevel === state.level;
  $('intro-retry').hidden = !isRetry;
  $('btn-practice-intro').hidden = state.level === 0;
  show('screen-intro');
}

function showFinished() {
  show('screen-finished');
}

/* ---------------- game ---------------- */

function startDay() {
  state.attempt = { date: todayStr(), wordIdx: 0, status: 'playing', failedWord: null };
  state.attempts++;
  saveState();
  resumeGame();
}

function resumeGame() {
  $('game-day').textContent = state.level + 1;
  startRound(currentTarget());
  show('screen-game');
}

function currentTarget() {
  return dayWords(state.level)[state.attempt.wordIdx];
}

function startRound(target, seedExtra = '') {
  const seed = (practice ? 'practice' + seedExtra : state.attempt.date) + '|' + target;
  round = {
    target,
    tiles: scramble(target, seed).map((ch) => ({ ch, used: false })),
    picks: [],
  };
  renderRound();
}

function renderRound() {
  if (!practice) {
    $('word-num').textContent = state.attempt.wordIdx + 1;
    $('day-bar').style.width = (state.attempt.wordIdx / WORDS_PER_DAY * 100) + '%';
  } else {
    $('word-num').textContent = practice.count + 1;
    $('day-bar').style.width = '0%';
  }
  renderTiles();
  renderSlots();
}

function renderTiles() {
  const cont = $('tiles');
  cont.innerHTML = '';
  round.tiles.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'tile' + (t.used ? ' used' : '');
    b.textContent = t.ch;
    b.onclick = () => pickTile(i);
    cont.appendChild(b);
  });
}

function renderSlots(flash = '') {
  const cont = $('slots');
  cont.innerHTML = '';
  for (let i = 0; i < round.target.length; i++) {
    const s = document.createElement('div');
    const tileIdx = round.picks[i];
    s.className = 'slot' + (tileIdx !== undefined ? ' filled' : '') + (flash ? ' ' + flash : '');
    s.textContent = tileIdx !== undefined ? round.tiles[tileIdx].ch : '';
    if (tileIdx !== undefined && !flash) s.onclick = () => unpick(i);
    cont.appendChild(s);
  }
  $('btn-submit').disabled = round.picks.length !== round.target.length || !!flash;
}

function pickTile(i) {
  if (round.tiles[i].used || round.picks.length >= round.target.length) return;
  round.tiles[i].used = true;
  round.picks.push(i);
  renderTiles();
  renderSlots();
}

function unpick(slotIdx) {
  const [tileIdx] = round.picks.splice(slotIdx, 1);
  round.tiles[tileIdx].used = false;
  renderTiles();
  renderSlots();
}

function eraseLast() {
  if (round.picks.length) unpick(round.picks.length - 1);
}

function reshuffle() {
  // vrátit vše a zamíchat volné dlaždice náhodně (jen vizuální pomoc)
  round.picks = [];
  const chars = round.tiles.map((t) => t.ch);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  round.tiles = chars.map((ch) => ({ ch, used: false }));
  renderRound();
}

function submit() {
  if (round.picks.length !== round.target.length) return;
  const guess = round.picks.map((i) => round.tiles[i].ch).join('');
  if (practice) { submitPractice(guess); return; }

  if (guess === round.target) {
    state.attempt.wordIdx++;
    const done = state.attempt.wordIdx >= WORDS_PER_DAY;
    if (done) winDay(); else saveState();
    renderSlots('correct');
    setTimeout(() => {
      if (done) showResult();
      else { startRound(currentTarget()); }
    }, 550);
  } else {
    loseDay();
    renderSlots('wrong');
    setTimeout(showResult, 900);
  }
}

function winDay() {
  state.attempt.status = 'won';
  state.level++;
  state.wins++;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
  state.streak = (state.lastWinDate === yesterday) ? state.streak + 1 : 1;
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  state.lastWinDate = todayStr();
  saveState();
}

function loseDay() {
  state.attempt.status = 'lost';
  state.attempt.failedWord = round.target;
  state.lastLostLevel = state.level;
  state.streak = 0;
  saveState();
}

/* ---------------- result ---------------- */

function showResult() {
  const a = state.attempt;
  const won = a.status === 'won';
  // po výhře je state.level už posunutý — slova dne jsou o level zpět
  const lvl = won ? state.level - 1 : state.level;
  const words = dayWords(lvl);

  $('result-emoji').textContent = won ? '🎉' : '😤';
  $('result-title').textContent = won ? `Den ${lvl + 1} zvládnut!` : 'Dnes to nevyšlo';
  $('result-sub').innerHTML = won
    ? `Odkryl(a) jsi dalších 20 slov. Zítra tě čeká den ${lvl + 2}.`
    : `Zvládnuto <b>${a.wordIdx}/20</b>. Hledané slovo bylo <b>${(a.failedWord || '').toUpperCase()}</b>.<br>Zítra stejných 20 slov — teď už je znáš!`;

  const cont = $('result-words');
  cont.innerHTML = '';
  words.forEach((w, i) => {
    if (!won && i > a.wordIdx) return; // neprozrazovat slova, která ještě nehrál
    const s = document.createElement('span');
    s.textContent = w;
    if (!won && i === a.wordIdx) s.className = 'missed';
    cont.appendChild(s);
  });

  $('result-uncovered').textContent = uncoveredCount();
  $('result-streak').textContent = state.streak;
  $('result-day').textContent = lvl + 1;
  $('btn-practice-result').hidden = uncoveredCount() === 0;

  startCountdown();
  show('screen-result');
}

function startCountdown() {
  clearInterval(countdownTimer);
  const el = $('countdown');
  const tick = () => {
    const now = new Date();
    const mid = new Date(now); mid.setHours(24, 0, 0, 0);
    const ms = mid - now;
    if (ms <= 0) { clearInterval(countdownTimer); refresh(); return; }
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    el.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ---------------- sdílení ---------------- */

function shareText() {
  const a = state.attempt;
  const won = a && a.date === todayStr() && a.status === 'won';
  const lost = a && a.date === todayStr() && a.status === 'lost';
  const dayNum = won ? state.level : state.level + 1;

  let lines = [];
  if (won) {
    lines.push(`2000 SLOV — den ${dayNum}/100 ✅` + (state.streak > 1 ? ` 🔥${state.streak}` : ''));
    lines.push('🟩'.repeat(10) + '\n' + '🟩'.repeat(10) + ' 20/20');
  } else if (lost) {
    const k = a.wordIdx;
    // pole emoji (ne string.slice — emoji jsou surrogate páry)
    const cells = [...Array(k).fill('🟩'), '🟥', ...Array(WORDS_PER_DAY - k - 1).fill('⬛')];
    lines.push(`2000 SLOV — den ${dayNum}/100`);
    lines.push(cells.slice(0, 10).join('') + '\n' + cells.slice(10).join('') + ` ${k}/20`);
  } else {
    lines.push(`2000 SLOV — jsem na dni ${dayNum}/100` + (state.streak > 1 ? ` 🔥${state.streak}` : ''));
  }
  lines.push(`Odkryto ${uncoveredCount()}/2000 slov`);
  lines.push(siteUrl());
  return lines.join('\n');
}

function challengeText() {
  const dayNum = Math.min(state.level + 1, TOTAL_LEVELS);
  return [
    `⚔️ Vyzývám tě na 2000 SLOV!`,
    `20 českých slov denně s přeházenými písmeny.`,
    `Jedna chyba = opakuješ celý den. 😈`,
    `Já jsem na dni ${dayNum}/100 — překonáš mě?`,
    siteUrl(),
  ].join('\n');
}

/* Náhled sdílení (jako 18words) — hráč vidí, co pošle, pak teprve share sheet. */
function openSharePreview(text) {
  $('share-preview').textContent = text;
  $('btn-share-confirm').onclick = () => { closeModals(); share(text); };
  openModal('modal-share');
}

async function share(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Zkopírováno! Vlož to kamarádům 😉');
  } catch (e) {
    toast('Sdílení se nepovedlo 😕');
  }
}

/* ---------------- trénink ---------------- */

function startPractice() {
  const pool = WORDS.slice(0, uncoveredCount());
  if (!pool.length) return;
  practice = { count: 0 };
  $('practice-note').hidden = false;
  $('game-day').textContent = state.level + 1;
  nextPracticeWord();
  show('screen-game');
}

function nextPracticeWord() {
  const pool = WORDS.slice(0, uncoveredCount());
  const target = pool[Math.floor(Math.random() * pool.length)];
  startRound(target, '|' + Date.now());
}

function submitPractice(guess) {
  if (guess === round.target) {
    practice.count++;
    renderSlots('correct');
    setTimeout(nextPracticeWord, 450);
  } else {
    renderSlots('wrong');
    setTimeout(() => {
      round.picks.forEach((i) => { round.tiles[i].used = false; });
      round.picks = [];
      renderRound();
    }, 500);
  }
}

/* ---------------- sbírka + statistiky ---------------- */

function renderCollection() {
  $('collection-count').textContent = uncoveredCount() + '/2000';
  const cont = $('collection');
  cont.innerHTML = '';
  for (let lvl = 0; lvl < TOTAL_LEVELS; lvl++) {
    if (lvl > state.level) {
      const d = document.createElement('div');
      d.className = 'locked';
      d.textContent = `🔒 Zbývá ${TOTAL_LEVELS - lvl} dní (${(TOTAL_LEVELS - lvl) * 20} slov)`;
      cont.appendChild(d);
      break;
    }
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    const done = lvl < state.level;
    sum.innerHTML = `Den ${lvl + 1} <span class="lvl-state">${done ? '✅ 20 slov' : '▶️ hraje se'}</span>`;
    det.appendChild(sum);
    if (done) {
      const w = document.createElement('div');
      w.className = 'words';
      dayWords(lvl).forEach((word) => {
        const s = document.createElement('span');
        s.textContent = word;
        w.appendChild(s);
      });
      det.appendChild(w);
    } else {
      const p = document.createElement('div');
      p.className = 'words';
      p.innerHTML = '<span>❓ slova se odkryjí po zvládnutí dne</span>';
      det.appendChild(p);
    }
    cont.appendChild(det);
  }
}

function renderStats() {
  $('stat-day').textContent = Math.min(state.level + 1, TOTAL_LEVELS);
  $('stat-uncovered').textContent = uncoveredCount();
  $('stat-streak').textContent = state.streak;
  $('stat-best').textContent = state.bestStreak;
  $('stat-attempts').textContent = state.attempts;
  $('stat-rate').textContent = state.attempts ? Math.round(state.wins / state.attempts * 100) + '%' : '0%';
}

/* ---------------- modaly ---------------- */

function openModal(id) { $(id).hidden = false; }
function closeModals() { for (const m of document.querySelectorAll('.modal-overlay')) m.hidden = true; }

/* ---------------- klávesnice ---------------- */

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModals(); return; }
  if ($('screen-game').hidden || !round) return;
  if (e.key === 'Enter') { submit(); return; }
  if (e.key === 'Backspace') { eraseLast(); return; }
  if (e.key.length === 1) {
    const ch = e.key.toLowerCase();
    const i = round.tiles.findIndex((t) => !t.used && t.ch === ch);
    if (i !== -1) pickTile(i);
  }
});

/* ---------------- events ---------------- */

$('btn-start').onclick = startDay;
$('btn-erase').onclick = eraseLast;
$('btn-shuffle').onclick = reshuffle;
$('btn-submit').onclick = submit;
$('btn-share').onclick = () => openSharePreview(shareText());
$('btn-challenge').onclick = () => openSharePreview(challengeText());
$('btn-share-stats').onclick = () => openSharePreview(shareText());
$('btn-share-finished').onclick = () => openSharePreview(`2000 SLOV — HOTOVO! 🏆\nOdkryl(a) jsem všech 2000 slov za ${state.attempts} pokusů.\n${siteUrl()}`);
$('btn-help').onclick = () => openModal('modal-help');
$('btn-stats').onclick = () => { renderStats(); openModal('modal-stats'); };
$('btn-collection').onclick = () => { renderCollection(); openModal('modal-collection'); };
$('btn-practice-intro').onclick = startPractice;
$('btn-practice-result').onclick = startPractice;
$('btn-practice-finished').onclick = startPractice;
$('btn-practice-exit').onclick = refresh;
for (const b of document.querySelectorAll('[data-close]')) b.onclick = closeModals;
for (const m of document.querySelectorAll('.modal-overlay')) {
  m.addEventListener('click', (e) => { if (e.target === m) closeModals(); });
}

/* ---------------- start ---------------- */

if (!state.seenHelp) {
  openModal('modal-help');
  state.seenHelp = true;
  saveState();
}
refresh();
