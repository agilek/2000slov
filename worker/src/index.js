// Backend hry 20 000 slov: skutečné percentily + denní připomínka přes Web Push.
// Běží na Cloudflare Workers + D1 (SQLite na edge). Zdarma v rámci free tier
// (100k čtení / 100k zápisů denně v D1). Web Push jede přes @pushforge/builder,
// jediná knihovna z tohohle výběru, co používá Web Crypto místo Node `crypto`/`https`
// a funguje tak přímo ve Workers.

import { buildPushHTTPRequest } from '@pushforge/builder';

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
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
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
    },
};

// Hra i API jedou na jedné doméně, takže CORS není potřeba vůbec.
function sameOrigin(request, url) {
    const origin = request.headers.get('Origin');
    return !origin || origin === url.origin;
}

function json(obj, status) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}

function validParams(day, score, clientId) {
    if (!Number.isInteger(day) || day < 1 || day > MAX_DAY) return false;
    if (!Number.isInteger(score) || score < 0 || score > 20) return false;
    if (typeof clientId !== 'string' || clientId.length < 8 || clientId.length > 64) return false;
    return true;
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
                        title: '2000 slov',
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
