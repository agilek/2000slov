// Backend hry 20 000 slov: skutečné percentily + denní připomínka přes Web Push.
// Běží na Cloudflare Workers + D1 (SQLite na edge). Zdarma v rámci free tier
// (100k čtení / 100k zápisů denně v D1). Web Push jede přes @pushforge/builder,
// jediná knihovna z tohohle výběru, co používá Web Crypto místo Node `crypto`/`https`
// a funguje tak přímo ve Workers.

import { buildPushHTTPRequest } from '@pushforge/builder';
import { clean, defTextError, validClient, VULGAR, AUTHOR_MAX } from './validate.js';
import {
    authEnabled, authStart, authPoll, authVerify, authApprove, authLandingPage,
    authLogout, meGet, meSetHandle, meDelete, currentUser, purgeAuth, devMode, devLogin,
} from './auth.js';
import { apiProfile, profilePage, validPlayedOn } from './profile.js';

const MIN_SAMPLE = 15; // pod tento počet hráčů dne se vrátí { real: false } a hra použije statický odhad
const MAX_DAY = 5000;
const ADMIN_CONTACT = 'https://github.com/agilek/2000slov'; // VAPID "sub" kontakt, viz RFC 8292
// Kam vede klepnutí na push notifikaci. V cronu není request, ze kterého by
// šlo origin odvodit, takže je natvrdo — po navázání vlastní domény přepsat.
const SITE_URL = 'https://slov2000.slov2000.workers.dev/';

// Cesty. Statiku servírují [assets] ve wrangler.toml, sem doteče jen to, co
// sedí na run_worker_first — proto tu nejsou žádné soubory.
const ROUTES = {
    'POST /api/result': handleSubmit,
    'GET /api/percentile': handlePercentile,
    'POST /api/subscribe': handleSubscribe,
    'GET /api/defs': handleDefsBatch,
    'GET /api/defs/word': handleDefsForWord,
    'GET /api/defs/mine': handleMyDefs,
    'POST /api/defs': handleDefCreate,
    'POST /api/defs/vote': handleDefVote,
    'POST /api/defs/report': handleDefReport,
    'POST /api/defs/edit': handleDefEdit,
    // Účty. Bez RESEND_KEY/MAIL_FROM zůstane /api/auth/start na 503 a klient
    // přihlášení vůbec nenabídne — viz `auth` v odpovědi /api/me.
    'POST /api/auth/start': (rq, env, url, ctx) => authStart(rq, env, url, ctx, json),
    'GET /api/auth/poll': (rq, env, url, ctx) => authPoll(rq, env, url, ctx, json),
    'POST /api/auth/verify': (rq, env, url, ctx) => authVerify(rq, env, url, ctx, json),
    'POST /api/auth/approve': (rq, env, url, ctx) => authApprove(rq, env, url, ctx, json),
    'POST /api/auth/logout': (rq, env, url, ctx) => authLogout(rq, env, url, ctx, json),
    'GET /prihlaseni': (rq, env, url) => authLandingPage(rq, env, url),
    'GET /api/me': (rq, env, url, ctx) => meGet(rq, env, url, ctx, json),
    'POST /api/me/handle': (rq, env, url, ctx) => meSetHandle(rq, env, url, ctx, json),
    'POST /api/me/delete': (rq, env, url, ctx) => meDelete(rq, env, url, ctx, json),
    'GET /api/profile': (rq, env, url, ctx) => apiProfile(rq, env, url, ctx, json),
    'POST /api/profile/backfill': handleBackfill,
    'GET /api/dev/login': (rq, env, url, ctx) => devLogin(rq, env, url, ctx, json),   // jen DEV=1, viz auth.js
};

// Limity na významy. Drží se v D1 dotazech, žádné nové úložiště.
const DEF_PER_DAY = 20;
const BATCH_MAX = 20;
const REPORTS_TO_HIDE = 3;

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        // Profil má v cestě přezdívku, takže se do tabulky cest nevejde.
        if (request.method === 'GET' && url.pathname.startsWith('/u/')) {
            return profilePage(request, env, url);
        }
        const handler = ROUTES[`${request.method} ${url.pathname}`];
        if (!handler) return json({ error: 'not found' }, 404);
        // CSRF: cizí stránka neumí poslat náš Content-Type bez preflightu (a ten
        // bez CORS hlaviček neprojde), Origin navíc musí sedět na vlastní doménu.
        if (request.method !== 'GET' && !sameOrigin(request, url)) {
            return json({ error: 'bad origin' }, 403);
        }
        try {
            return await handler(request, env, url, ctx);
        } catch (err) {
            return json({ error: 'internal error' }, 500);
        }
    },

    // Cron trigger (viz wrangler.toml) — jednou denně pošle připomínku všem odběratelům.
    async scheduled(event, env, ctx) {
        ctx.waitUntil(sendDailyReminders(env));
        ctx.waitUntil(purgeAuth(env));   // prošlé žádosti a session, ať IP hashe neleží
    },
};

// Hra i API jedou na jedné doméně, takže CORS není potřeba vůbec.
function sameOrigin(request, url) {
    const origin = request.headers.get('Origin');
    return !origin || origin === url.origin;
}

function json(obj, status, extra) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra || {}),
    });
}

function validParams(day, score, clientId) {
    if (!Number.isInteger(day) || day < 1 || day > MAX_DAY) return false;
    if (!Number.isInteger(score) || score < 0 || score > 20) return false;
    if (typeof clientId !== 'string' || clientId.length < 8 || clientId.length > 64) return false;
    return true;
}

// Historie z doby před přihlášením — klient si ji tvrdí sám, stejně jako
// /api/result. Proto profil ano, žebříček ne.
async function handleBackfill(request, env) {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'not logged in' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
    const days = Array.isArray(body && body.days) ? body.days.slice(0, 400) : [];
    const rows = days.filter(d =>
        validPlayedOn(d && d.d) && Number.isInteger(d.score) && d.score >= 0 && d.score <= 20
        && Number.isInteger(d.dayIdx) && d.dayIdx >= 0 && d.dayIdx < 365);
    if (!rows.length) return json({ ok: true, added: 0 }, 200);
    await env.DB.batch(rows.map(d => env.DB.prepare(
        `INSERT INTO profile_days (user_id, played_on, day_idx, score, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(user_id, played_on) DO NOTHING`
    ).bind(user.id, d.d, d.dayIdx, d.score, Date.now())));
    return json({ ok: true, added: rows.length }, 200);
}

async function handleSubmit(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'bad json' }, 400);
    }

    const day = Number(body.day);
    const score = Number(body.score);
    const clientId = String(body.clientId || '');
    if (!validParams(day, score, clientId)) {
        return json({ error: 'bad params' }, 400);
    }

    // upsert: pokud hráč (stejné clientId) pro tento den už výsledek poslal, přepíše se
    await env.DB.prepare(
        `INSERT INTO results (day, score, client_id, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(day, client_id) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at`
    ).bind(day, score, clientId, Date.now()).run();

    // Přihlášenému se den zapíše i do profilu — klíčováno skutečným datem,
    // protože index dne se po roce opakuje. Nepřihlášení hrají beze změny.
    const user = await currentUser(request, env);
    if (user && validPlayedOn(body.playedOn)) {
        await env.DB.prepare(
            `INSERT INTO profile_days (user_id, played_on, day_idx, score, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(user_id, played_on) DO UPDATE SET score = excluded.score`
        ).bind(user.id, body.playedOn, day - 1, score, Date.now()).run();
    }

    return json(await computePercentile(env, day, score), 200);
}

async function handlePercentile(request, env, url) {
    const day = Number(url.searchParams.get('day'));
    const score = Number(url.searchParams.get('score'));
    if (!Number.isInteger(day) || !Number.isInteger(score) || score < 0 || score > 20) {
        return json({ error: 'bad params' }, 400);
    }
    return json(await computePercentile(env, day, score), 200);
}

async function computePercentile(env, day, score) {
    const totalRow = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM results WHERE day = ?1'
    ).bind(day).first();
    const total = totalRow?.n || 0;

    if (total < MIN_SAMPLE) {
        return { real: false, total };
    }

    const betterOrEqualRow = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM results WHERE day = ?1 AND score >= ?2'
    ).bind(day, score).first();
    const betterOrEqual = betterOrEqualRow?.n || 0;

    const topPct = Math.max(1, Math.round((betterOrEqual / total) * 100));
    return { real: true, total, topPct };
}

function validSubscription(clientId, endpoint, keys) {
    if (typeof clientId !== 'string' || clientId.length < 8 || clientId.length > 64) return false;
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return false;
    if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return false;
    return true;
}

async function handleSubscribe(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'bad json' }, 400);
    }

    const clientId = String(body.clientId || '');
    const endpoint = String(body.endpoint || '');
    const keys = body.keys || {};
    if (!validSubscription(clientId, endpoint, keys)) {
        return json({ error: 'bad params' }, 400);
    }

    // upsert: nová registrace stejného zařízení (nový endpoint po re-subscribe) přepíše starou
    await env.DB.prepare(
        `INSERT INTO subscriptions (client_id, endpoint, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(client_id) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at`
    ).bind(clientId, endpoint, keys.p256dh, keys.auth, Date.now()).run();

    return json({ ok: true }, 200);
}

/* ---------------- komunitní významy slov ---------------- */

const now = () => Date.now();

function defRow(r, userId) {
    return {
        id: r.id,
        word: r.word,
        text: r.text,
        author: r.author,          // vždy přezdívka z účtu — anonymní autoři neexistují
        votes: r.votes,
        mine: !!userId && r.user_id === userId,
    };
}

// Klíč do edge cache. Staví se ručně, NIKDY z příchozího requestu — ten nese
// cookies a dotaz clientId a cache by se roztříštila (nebo prosákla mezi hráče).
const defCacheKey = (w) => new Request(`https://cache.local/def/${encodeURIComponent(w)}`);

// Nejlépe hodnocený význam pro až BATCH_MAX slov naráz — hra si je natahuje
// dopředu, aby přechodová obrazovka nikdy nečekala na síť.
// Cachuje se po jednotlivých slovech, ne po dávce: fronty jsou u každého hráče
// jiné, takže klíč podle složení dávky by se skoro netrefil.
async function handleDefsBatch(request, env, url, ctx) {
    const raw = (url.searchParams.get('w') || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
    const words = [...new Set(raw)].slice(0, BATCH_MAX);
    if (!words.length) return json({ defs: {} }, 200);
    const me = await currentUser(request, env);

    // Ve vývoji bez cache: seed zapisuje rovnou do D1 a uložené „bez významu"
    // by ho 5 minut zakrývalo.
    const cache = devMode(env) ? null : caches.default;
    const rows = {};                                    // slovo -> řádek | null
    const misses = [];
    for (const w of words) {
        const hit = cache && await cache.match(defCacheKey(w));
        if (hit) rows[w] = await hit.json();
        else misses.push(w);
    }

    if (misses.length) {
        const marks = misses.map(() => '?').join(',');
        const { results } = await env.DB.prepare(
            `SELECT * FROM (
               SELECT *, ROW_NUMBER() OVER (PARTITION BY word ORDER BY votes DESC, created_at ASC) AS rn
               FROM definitions WHERE hidden = 0 AND word IN (${marks})
             ) WHERE rn = 1`
        ).bind(...misses).all();
        for (const w of misses) rows[w] = null;          // i prázdno je odpověď
        for (const r of results) rows[r.word] = r;
        // Ukládá se i to prázdno — slov bez významu je zdaleka nejvíc a právě
        // ta nemá smysl pouštět na D1 pořád dokola.
        for (const w of cache ? misses : []) {
            const body = new Response(JSON.stringify(rows[w]), {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
            });
            ctx ? ctx.waitUntil(cache.put(defCacheKey(w), body)) : await cache.put(defCacheKey(w), body);
        }
    }

    // `mine` je na hráče, takže se dopočítá až po cache.
    const defs = {};
    for (const w of words) defs[w] = rows[w] ? defRow(rows[w], me && me.id) : null;
    return json({ defs }, 200);
}

// Po zápisu je uložené slovo neplatné. Purge je per-kolo, takže v jiném regionu
// může být až max-age (300 s) stará odpověď — u hobby hry přijatelné.
async function dropDefCache(word, ctx) {
    if (!word) return;
    const p = caches.default.delete(defCacheKey(word));
    if (ctx) ctx.waitUntil(p); else await p;
}

async function handleDefsForWord(request, env, url) {
    const word = (url.searchParams.get('w') || '').trim().toLowerCase();
    if (!word) return json({ error: 'bad params' }, 400);
    const me = await currentUser(request, env);
    const { results } = await env.DB.prepare(
        'SELECT * FROM definitions WHERE word = ?1 AND hidden = 0 ORDER BY votes DESC, created_at ASC LIMIT 50'
    ).bind(word).all();
    return json({ word, defs: results.map(r => defRow(r, me && me.id)) }, 200);
}

async function handleMyDefs(request, env) {
    const me = await currentUser(request, env);
    if (!me) return json({ defs: [] }, 200);
    const { results } = await env.DB.prepare(
        'SELECT * FROM definitions WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100'
    ).bind(me.id).all();
    return json({ defs: results.map(r => defRow(r, me.id)) }, 200);
}

async function handleDefCreate(request, env, url, ctx) {
    // Psát smí jen přihlášený — jinak by u významu stálo jméno, za kterým
    // nikdo nestojí a které si může vzít kdokoli.
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'Významy může přidávat jen přihlášený hráč.' }, 401);
    if (!user.handle) return json({ error: 'Nejdřív si zvol přezdívku.' }, 400);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
    const { clientId, word, text } = body || {};
    if (typeof word !== 'string' || !word.trim()) return json({ error: 'bad params' }, 400);
    const err = defTextError(text);
    if (err) return json({ error: err }, 400);
    const name = user.handle;

    const dayAgo = now() - 86400000;
    const { results: cnt } = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM definitions WHERE user_id = ?1 AND created_at > ?2'
    ).bind(user.id, dayAgo).all();
    if (cnt[0].n >= DEF_PER_DAY) {
        return json({ error: `Denní limit je ${DEF_PER_DAY} významů. Zkus to zítra.` }, 429);
    }

    const id = crypto.randomUUID();
    try {
        await env.DB.prepare(
            `INSERT INTO definitions (id, word, text, client_id, user_id, author, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        ).bind(id, word.trim().toLowerCase(), clean(text),
               validClient(clientId) ? clientId : null, user.id, name, now()).run();
    } catch (e) {
        // jediný unikátní index je (user_id, word)
        return json({ error: 'K tomuhle slovu už svůj význam máš.' }, 409);
    }
    await dropDefCache(word.trim().toLowerCase(), ctx);
    return json({ ok: true, id }, 200);
}

// Úprava vlastního významu. Když text měl hlasy, úprava je smaže — jinak by
// šlo vyhlasovat neškodnou větu a pak ji přepsat na něco jiného.
async function handleDefEdit(request, env, url, ctx) {
    const me = await currentUser(request, env);
    if (!me) return json({ error: 'Upravovat může jen přihlášený hráč.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
    const { id, text } = body || {};
    if (typeof id !== 'string' || !id) return json({ error: 'bad params' }, 400);
    const err = defTextError(text);
    if (err) return json({ error: err }, 400);

    const { results } = await env.DB.prepare(
        'SELECT user_id, word, text, votes FROM definitions WHERE id = ?1'
    ).bind(id).all();
    if (!results.length) return json({ error: 'not found' }, 404);
    const row = results[0];
    if (row.user_id !== me.id) return json({ error: 'Upravit jde jen vlastní význam.' }, 403);

    const novy = clean(text);
    if (novy === row.text) return json({ ok: true, votes: row.votes, resetVotes: false }, 200);

    const resetVotes = row.votes > 0;
    const statements = [
        env.DB.prepare('UPDATE definitions SET text = ?1 WHERE id = ?2').bind(novy, id),
    ];
    if (resetVotes) {
        statements.push(env.DB.prepare('DELETE FROM votes WHERE definition_id = ?1').bind(id));
        statements.push(env.DB.prepare('UPDATE definitions SET votes = 0 WHERE id = ?1').bind(id));
    }
    await env.DB.batch(statements);
    await dropDefCache(row.word, ctx);
    return json({ ok: true, votes: resetVotes ? 0 : row.votes, resetVotes }, 200);
}

async function handleDefVote(request, env, url, ctx) {
    const me = await currentUser(request, env);
    if (!me) return json({ error: 'Hlasovat může jen přihlášený hráč.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
    const { id } = body || {};
    if (typeof id !== 'string' || !id) return json({ error: 'bad params' }, 400);
    const clientId = me.id;

    const { results: own } = await env.DB.prepare('SELECT user_id, word FROM definitions WHERE id = ?1').bind(id).all();
    if (!own.length) return json({ error: 'not found' }, 404);
    if (own[0].user_id === me.id) return json({ error: 'Svůj vlastní význam hodnotit nejde.' }, 400);

    const { results: had } = await env.DB.prepare(
        'SELECT 1 AS x FROM votes WHERE definition_id = ?1 AND client_id = ?2'
    ).bind(id, clientId).all();
    if (had.length) {
        await env.DB.batch([
            env.DB.prepare('DELETE FROM votes WHERE definition_id = ?1 AND client_id = ?2').bind(id, clientId),
            env.DB.prepare('UPDATE definitions SET votes = (SELECT COUNT(*) FROM votes WHERE definition_id = ?1) WHERE id = ?1').bind(id),
        ]);
    } else {
        await env.DB.batch([
            env.DB.prepare('INSERT OR IGNORE INTO votes (definition_id, client_id, created_at) VALUES (?1, ?2, ?3)').bind(id, clientId, now()),
            env.DB.prepare('UPDATE definitions SET votes = (SELECT COUNT(*) FROM votes WHERE definition_id = ?1) WHERE id = ?1').bind(id),
        ]);
    }
    const { results } = await env.DB.prepare('SELECT votes FROM definitions WHERE id = ?1').bind(id).all();
    await dropDefCache(own[0].word, ctx);
    return json({ ok: true, votes: results[0].votes, voted: !had.length }, 200);
}

async function handleDefReport(request, env, url, ctx) {
    const me = await currentUser(request, env);
    if (!me) return json({ error: 'Nahlásit může jen přihlášený hráč.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
    const { id } = body || {};
    if (typeof id !== 'string' || !id) return json({ error: 'bad params' }, 400);
    const clientId = me.id;
    await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO reports (definition_id, client_id, created_at) VALUES (?1, ?2, ?3)').bind(id, clientId, now()),
        env.DB.prepare(
            `UPDATE definitions SET reports = (SELECT COUNT(*) FROM reports WHERE definition_id = ?1),
             hidden = CASE WHEN (SELECT COUNT(*) FROM reports WHERE definition_id = ?1) >= ${REPORTS_TO_HIDE} THEN 1 ELSE hidden END
             WHERE id = ?1`
        ).bind(id),
    ]);
    const { results: w } = await env.DB.prepare('SELECT word FROM definitions WHERE id = ?1').bind(id).all();
    if (w.length) await dropDefCache(w[0].word, ctx);
    return json({ ok: true }, 200);
}

async function sendDailyReminders(env) {
    if (!env.VAPID_PRIVATE_JWK) return; // secret nenastaven (lokální dev, nebo zapomenuté nasazení) — cron tiše nic neudělá
    const privateJWK = JSON.parse(env.VAPID_PRIVATE_JWK);
    const { results } = await env.DB.prepare(
        'SELECT client_id, endpoint, p256dh, auth FROM subscriptions'
    ).all();

    for (const sub of results) {
        try {
            const { endpoint, headers, body } = await buildPushHTTPRequest({
                privateJWK,
                subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                message: {
                    payload: {
                        title: '20 slov',
                        body: 'Dnešní slovo na tebe čeká! 🔤',
                        url: SITE_URL,
                    },
                    adminContact: ADMIN_CONTACT,
                },
            });
            const res = await fetch(endpoint, { method: 'POST', headers, body });
            // 404/410 = odběr na straně prohlížeče zanikl (odinstalace, zrušení oprávnění) — smazat.
            if (res.status === 404 || res.status === 410) {
                await env.DB.prepare('DELETE FROM subscriptions WHERE client_id = ?1').bind(sub.client_id).run();
            }
        } catch (err) {
            // jeden nepovedený push nesmí shodit zbytek dávky
        }
    }
}
