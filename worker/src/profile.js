// Veřejný profil hráče: rok denních výzev jako mřížka + pár statistik.
// Renderuje se na serveru kvůli náhledu při sdílení (og:*) — SPA route by
// poslala prázdný index.html. Mřížka je statické inline SVG, žádný JS.

const PER_DAY = 20;
const DAYS = 365;

const esc = (t) => String(t).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const iso = (d) => d.toISOString().slice(0, 10);
const dayBefore = (isoDate, n) => {
    const d = new Date(isoDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return iso(d);
};

export const validPlayedOn = (s) =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

// Statistiky se počítají při čtení — je jich nejvýš 365 řádků.
function stats(rows) {
    const byDate = new Map(rows.map(r => [r.played_on, r.score]));
    const dny = rows.length;
    const slova = rows.reduce((a, r) => a + r.score, 0);
    const perfektnich = rows.filter(r => r.score === PER_DAY).length;
    const dnes = iso(new Date());

    // Aktuální série smí začínat dneškem nebo včerejškem (dnešek ještě nemusel hrát).
    let serie = 0;
    for (let i = byDate.has(dnes) ? 0 : 1; ; i++) {
        if (!byDate.has(dayBefore(dnes, i))) break;
        serie++;
        if (i > DAYS) break;
    }
    let nejdelsi = 0, bezi = 0;
    const serazene = [...byDate.keys()].sort();
    let predchozi = null;
    for (const d of serazene) {
        bezi = (predchozi && dayBefore(d, 1) === predchozi) ? bezi + 1 : 1;
        if (bezi > nejdelsi) nejdelsi = bezi;
        predchozi = d;
    }
    return {
        dny, slova, perfektnich, serie, nejdelsi,
        uspesnost: dny ? Math.round(slova / (dny * PER_DAY) * 100) : 0,
    };
}

async function loadProfile(env, handle) {
    const { results: users } = await env.DB.prepare(
        'SELECT id, handle, hide_profile FROM users WHERE handle_lc = ?1'
    ).bind(String(handle || '').toLowerCase()).all();
    const user = users[0];
    if (!user || user.hide_profile) return null;
    const { results: rows } = await env.DB.prepare(
        'SELECT played_on, day_idx, score FROM profile_days WHERE user_id = ?1 AND played_on >= ?2 ORDER BY played_on'
    ).bind(user.id, dayBefore(iso(new Date()), DAYS)).all();
    return { user, rows, stats: stats(rows) };
}

export async function apiProfile(request, env, url, ctx, json) {
    const data = await loadProfile(env, url.searchParams.get('handle'));
    if (!data) return json({ error: 'not found' }, 404);
    return json({
        handle: data.user.handle,
        stats: data.stats,
        days: data.rows.map(r => ({ d: r.played_on, score: r.score })),
    }, 200);
}

// Odstín podle skóre — pět stupňů, ať je vidět rozdíl mezi „odehráno" a „čistý den".
const tint = (score) =>
    score === undefined ? 'var(--empty)'
    : score === PER_DAY ? '#2e9e5b'
    : score >= 15 ? '#57b97c'
    : score >= 10 ? '#8ed0a5'
    : score >= 1 ? '#c5e6d1'
    : 'var(--empty)';

function grid(rows) {
    const byDate = new Map(rows.map(r => [r.played_on, r.score]));
    const dnes = iso(new Date());
    // Zarovnat konec na dnešek a začátek na pondělí, ať řádky sedí na dny v týdnu.
    const posun = (new Date(dnes + 'T00:00:00Z').getUTCDay() + 6) % 7;   // 0 = pondělí
    const start = dayBefore(dnes, DAYS - 1 + ((7 - ((DAYS - 1 - posun) % 7)) % 7));
    const bunky = [];
    const tydny = Math.ceil((DAYS + posun) / 7) + 1;
    for (let w = 0; w < tydny; w++) {
        for (let d = 0; d < 7; d++) {
            const datum = dayBefore(start, -(w * 7 + d));
            if (datum > dnes) continue;
            const score = byDate.get(datum);
            bunky.push(
                `<rect x="${w * 14}" y="${d * 14}" width="11" height="11" rx="2.5" `
                + `fill="${tint(score)}"><title>${datum}${score === undefined ? '' : ` — ${score}/20`}</title></rect>`);
        }
    }
    return `<svg width="${tydny * 14}" height="98" viewBox="0 0 ${tydny * 14} 98" role="img" `
        + `aria-label="Rok denních výzev">${bunky.join('')}</svg>`;
}

const statTile = (v, l) =>
    `<div class="t"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`;

export async function profilePage(request, env, url) {
    const handle = decodeURIComponent(url.pathname.replace(/^\/u\//, '')).trim();
    const data = await loadProfile(env, handle);
    const site = url.origin;
    if (!data) {
        return new Response(page('Profil nenalezen', `<h1>Profil nenalezen</h1>
            <p class="note">Tenhle hráč tu není, nebo má profil skrytý.</p>
            <p><a class="btn" href="${site}/">Zahrát si 2000 slov</a></p>`, '', site),
            { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const s = data.stats;
    const jmeno = esc(data.user.handle);
    const popis = `${s.dny} odehraných dní · série ${s.serie} · ${s.perfektnich}× všech 20 slov`;
    const telo = `
      <div class="head"><div class="av">${esc(jmeno.charAt(0).toUpperCase())}</div>
        <h1>${jmeno}</h1><p class="note">${esc(popis)}</p></div>
      <div class="stats">
        ${statTile(String(s.serie), 'dní v řadě')}
        ${statTile(String(s.dny), 'odehraných dní')}
        ${statTile(String(s.perfektnich), 'čistých dní')}
        ${statTile(s.uspesnost + ' %', 'úspěšnost')}
      </div>
      <h2>Rok denních výzev</h2>
      <div class="scroll" dir="rtl"><div dir="ltr">${grid(data.rows)}</div></div>
      <p class="legend"><span>méně</span>
        ${[undefined, 1, 10, 15, 20].map(v => `<i style="background:${tint(v)}"></i>`).join('')}
        <span>více</span></p>
      <p><a class="btn" href="${site}/">Zahrát si taky</a></p>`;
    const meta = `
      <meta property="og:title" content="${jmeno} — 2000 slov">
      <meta property="og:description" content="${esc(popis)}">
      <meta property="og:type" content="profile">
      <meta property="og:url" content="${site}/u/${encodeURIComponent(data.user.handle)}">
      <meta name="twitter:card" content="summary">`;
    return new Response(page(`${jmeno} — 2000 slov`, telo, meta, site), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    });
}

function page(title, body, meta, site) {
    return `<!doctype html><html lang="cs"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${meta}
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Nunito:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#fff;--ink:#1c1c1e;--muted:#616162;--card:#fff;--line:#ece9e0;--empty:#dcd9d0;--blue:#4169f1;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:#171614;--ink:#f3f1ec;--muted:#a29c92;--card:#211f1c;--line:#332f2a;--empty:#2b2825;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Nunito,system-ui,sans-serif;
padding:32px 20px calc(32px + env(safe-area-inset-bottom));display:flex;justify-content:center}
.wrap{width:100%;max-width:440px}
h1{font-family:'Baloo 2',sans-serif;font-size:26px;margin:0}
h2{font-family:'Baloo 2',sans-serif;font-size:15px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin:26px 0 10px}
.head{text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px}
.av{width:78px;height:78px;border-radius:50%;background:var(--blue);color:#fff;display:flex;
align-items:center;justify-content:center;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:32px}
.note{color:var(--muted);font-size:14px;margin:0;line-height:1.5}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}
.t{background:var(--card);border:2px solid var(--line);border-radius:18px;padding:14px}
.v{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:25px;line-height:1.1}
.l{color:var(--muted);font-size:13px}
.scroll{overflow-x:auto;padding-bottom:6px;-webkit-overflow-scrolling:touch}
.scroll>div{display:inline-block}
.legend{display:flex;align-items:center;gap:5px;color:var(--muted);font-size:12px;margin:8px 0 0}
.legend i{width:11px;height:11px;border-radius:2.5px;display:inline-block}
.btn{display:inline-block;margin-top:26px;background:#2e9e5b;color:#fff;text-decoration:none;
font-family:'Baloo 2',sans-serif;font-weight:800;padding:14px 32px;border-radius:999px}
</style></head><body><div class="wrap">${body}</div></body></html>`;
}
