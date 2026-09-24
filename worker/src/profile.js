// Veřejný profil hráče: statistiky, rok denních výzev a jeho významy slov.
// Renderuje se na serveru kvůli náhledu při sdílení (og:*) — SPA route by
// poslala prázdný index.html. Markup používá třídy a styly samotné hry
// (style.css + kostky.css), takže vypadá stejně jako aplikace. Hra si
// ?cast=1 bere jen obsah a ukáže ho jako svou obrazovku — jeden vzhled, dvě cesty.

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

const DEFS_SHOWN = 10;

async function loadProfile(env, handle) {
    const { results: users } = await env.DB.prepare(
        'SELECT id, handle, hide_profile FROM users WHERE handle_lc = ?1'
    ).bind(String(handle || '').toLowerCase()).all();
    const user = users[0];
    if (!user || user.hide_profile) return null;
    const [{ results: rows }, { results: defs }, { results: cnt }] = await Promise.all([
        env.DB.prepare(
            'SELECT played_on, day_idx, score FROM profile_days WHERE user_id = ?1 AND played_on >= ?2 ORDER BY played_on'
        ).bind(user.id, dayBefore(iso(new Date()), DAYS)).all(),
        // „best" = význam, který hra u slova ukazuje nahoře (nejvíc hlasů, při
        // shodě starší) — a jen když porazil jiné; jediný význam slova není výhra.
        env.DB.prepare(`SELECT d.word, d.text, d.votes, EXISTS (
                SELECT 1 FROM definitions o WHERE o.word = d.word AND o.hidden = 0 AND o.id != d.id) AND NOT EXISTS (
                SELECT 1 FROM definitions o WHERE o.word = d.word AND o.hidden = 0 AND o.id != d.id
                AND (o.votes > d.votes OR (o.votes = d.votes AND o.created_at < d.created_at))) AS best
            FROM definitions d WHERE d.user_id = ?1 AND d.hidden = 0
            ORDER BY d.votes DESC, d.created_at DESC LIMIT ?2`).bind(user.id, DEFS_SHOWN).all(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM definitions WHERE user_id = ?1 AND hidden = 0').bind(user.id).all(),
    ]);
    return { user, rows, stats: stats(rows), defs, defsTotal: cnt[0].n };
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

const num = (n) => n.toLocaleString('cs-CZ');
const plural = (n, one, few, many) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;
const MESICE = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
const DNY = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const kratce = (d) => `${+d.slice(8, 10)}. ${+d.slice(5, 7)}.`;
const dlouze = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Stupeň kostky: 0 nehráno, 1–3 odstíny zelené, 4 zlatá za všech 20.
const stupen = (score) =>
    score === undefined ? 0 : score === PER_DAY ? 4 : score >= 15 ? 3 : score >= 10 ? 2 : 1;

// Rok svisle jako kalendář: týden = řádek Po–Ne, nahoře nejstarší. Začíná
// týdnem prvního odehraného dne (nejdál před rokem), ať nový hráč nemá
// stránku prázdných řádků.
function calendar(rows) {
    const byDate = new Map(rows.map(r => [r.played_on, r.score]));
    const dnes = iso(new Date());
    const od = rows.length ? rows[0].played_on : dnes;
    const pondeli = dayBefore(od, (new Date(od + 'T00:00:00Z').getUTCDay() + 6) % 7);
    const out = ['<span></span>', ...DNY.map(d => `<span class="yc-head">${d}</span>`)];
    for (let tyden = pondeli; tyden <= dnes; tyden = dayBefore(tyden, -7)) {
        const dny = DNY.map((_, i) => dayBefore(tyden, -i));
        const prvni = dny.find(d => d.endsWith('-01'));
        const mesic = prvni || (tyden === pondeli ? tyden : null);
        out.push(`<span class="yc-month">${mesic ? MESICE[+mesic.slice(5, 7) - 1] : ''}</span>`);
        for (const d of dny) {
            if (d > dnes) { out.push('<i class="yc-day yc-future"></i>'); continue; }
            const score = byDate.get(d);
            out.push(`<i class="yc-day s${stupen(score)}${d === dnes ? ' yc-today' : ''}" `
                + `title="${kratce(d)} — ${score === undefined ? 'nehráno' : `${score}/20`}"></i>`);
        }
    }
    return out.join('');
}

const statTile = (value, label, extra = '') =>
    `<div class="stat-tile${extra}"><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`;

const defItem = (d) => `<li class="def-item${d.best ? ' def-item--best' : ''}">`
    + (d.best ? '<div class="def-best-label">Nejlepší význam</div>' : '')
    + `<div class="def-word">${esc(d.word)}</div><p class="wd-text">${esc(d.text)}</p>`
    + `<div class="wd-meta"><span><span class="emoji" data-emoji="palec">👍</span> ${num(d.votes)}</span></div></li>`;

// Obsah profilu — stejný pro samostatnou stránku i obrazovku ve hře.
function profileBody(data) {
    const s = data.stats;
    const jmeno = esc(data.user.handle);
    const zbyva = data.defsTotal - data.defs.length;
    return `
      <div class="profile-head">
        <div class="profile-avatar" aria-hidden="true">${esc(data.user.handle.charAt(0).toUpperCase())}</div>
        <div class="profile-name">${jmeno}</div>
        <div class="profile-sub">${data.rows.length ? `Hraje od ${esc(dlouze(data.rows[0].played_on))}` : 'Zatím bez odehraného dne'}</div>
      </div>
      <div class="profile-section">
        <h3 class="profile-section-title">Statistiky</h3>
        <div class="stat-grid">
          ${statTile(num(s.serie), 'dní v řadě', s.serie ? '' : ' stat-tile--off')}
          ${statTile(num(s.dny), 'odehraných dní')}
          ${statTile(num(s.slova), 'slov v denní výzvě')}
          ${statTile(`${s.uspesnost} %`, 'úspěšnost')}
        </div>
      </div>
      <div class="profile-section">
        <h3 class="profile-section-title">Rok denních výzev</h3>
        <div class="year-cal" role="img" aria-label="Rok denních výzev: ${num(s.dny)} odehraných dní, ${num(s.perfektnich)}× všech 20 slov">${calendar(data.rows)}</div>
        <p class="yc-legend" aria-hidden="true"><span>méně</span>${[0, 1, 2, 3].map(n => `<i class="yc-day s${n}"></i>`).join('')}<span>více</span><i class="yc-day s4"></i><span>všech 20</span></p>
      </div>
      <div class="profile-section">
        <h3 class="profile-section-title">Významy slov</h3>
        ${data.defs.length
            ? `<ul class="defs-list">${data.defs.map(defItem).join('')}</ul>`
              + (zbyva > 0 ? `<p class="profile-note">…a ${plural(zbyva, 'další', 'další', 'dalších')} ${num(zbyva)} ${plural(zbyva, 'význam', 'významy', 'významů')}.</p>` : '')
            : '<div class="empty-card">Zatím žádný význam.</div>'}
      </div>`;
}

export async function profilePage(request, env, url) {
    const handle = decodeURIComponent(url.pathname.replace(/^\/u\//, '')).trim();
    const data = await loadProfile(env, handle);
    const site = url.origin;
    const cast = url.searchParams.has('cast');
    const html = (body, status, cache) => new Response(body, {
        status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache },
    });
    if (!data) {
        const body = `<div class="profile-head"><div class="profile-name">Profil nenalezen</div>
            <div class="profile-sub">Tenhle hráč tu není, nebo má profil skrytý.</div></div>`;
        return html(cast ? body : page('Profil nenalezen', body, ''), 404, 'no-store');
    }
    // Hra chce vidět čerstvé číslo hned po dohrání dne, sdílený odkaz snese 5 minut.
    if (cast) return html(profileBody(data), 200, 'no-store');

    const s = data.stats;
    const jmeno = esc(data.user.handle);
    const popis = `${s.dny} odehraných dní · série ${s.serie} · ${s.perfektnich}× všech 20 slov`;
    const meta = `
      <meta property="og:title" content="${jmeno} — 20 slov">
      <meta property="og:description" content="${esc(popis)}">
      <meta property="og:type" content="profile">
      <meta property="og:url" content="${site}/u/${encodeURIComponent(data.user.handle)}">
      <meta name="twitter:card" content="summary">`;
    return html(page(`${jmeno} — 20 slov`, profileBody(data), meta), 200, 'public, max-age=300');
}

// Samostatná stránka pro sdílený odkaz: styly a písma hry, obsah jako
// obrazovka hry, dole pozvánka do hry.
function page(title, body, meta) {
    return `<!doctype html><html lang="cs"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>${meta}
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131f24" media="(prefers-color-scheme: dark)">
<link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:wght@400;600;700;800&display=swap&subset=latin-ext" rel="stylesheet">
<link rel="preload" href="/fonts/SlovkaOne-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/designs/kostky.css">
</head><body><div class="screen active public-page" id="publicProfile">${body}
<a class="btn btn-play" href="/">Zahrát si taky</a></div></body></html>`;
}
