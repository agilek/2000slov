// Backend hry 20 000 slov: skutečné percentily místo statického odhadu.
// Bez závislostí, běží na Cloudflare Workers + D1 (SQLite na edge). Zdarma
// v rámci free tier (100k čtení / 100k zápisů denně v D1).

const MIN_SAMPLE = 15; // pod tento počet hráčů dne se vrátí { real: false } a hra použije statický odhad
const MAX_DAY = 5000;

// Povolené originy pro CORS — nasazená hra + lokální vývoj.
const ALLOWED_ORIGINS = new Set([
    'https://agilek.github.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
]);

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const cors = corsHeaders(request);

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: cors });
        }

        try {
            if (url.pathname === '/api/result' && request.method === 'POST') {
                return await handleSubmit(request, env, cors);
            }
            if (url.pathname === '/api/percentile' && request.method === 'GET') {
                return await handlePercentile(url, env, cors);
            }
        } catch (err) {
            return json({ error: 'internal error' }, 500, cors);
        }

        return json({ error: 'not found' }, 404, cors);
    },
};

function corsHeaders(request) {
    const origin = request.headers.get('Origin');
    const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://agilek.github.io';
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
        'Content-Type': 'application/json; charset=utf-8',
    };
}

function json(obj, status, cors) {
    return new Response(JSON.stringify(obj), { status, headers: cors });
}

function validParams(day, score, clientId) {
    if (!Number.isInteger(day) || day < 1 || day > MAX_DAY) return false;
    if (!Number.isInteger(score) || score < 0 || score > 20) return false;
    if (typeof clientId !== 'string' || clientId.length < 8 || clientId.length > 64) return false;
    return true;
}

async function handleSubmit(request, env, cors) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'bad json' }, 400, cors);
    }

    const day = Number(body.day);
    const score = Number(body.score);
    const clientId = String(body.clientId || '');
    if (!validParams(day, score, clientId)) {
        return json({ error: 'bad params' }, 400, cors);
    }

    // upsert: pokud hráč (stejné clientId) pro tento den už výsledek poslal, přepíše se
    await env.DB.prepare(
        `INSERT INTO results (day, score, client_id, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(day, client_id) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at`
    ).bind(day, score, clientId, Date.now()).run();

    return json(await computePercentile(env, day, score), 200, cors);
}

async function handlePercentile(url, env, cors) {
    const day = Number(url.searchParams.get('day'));
    const score = Number(url.searchParams.get('score'));
    if (!Number.isInteger(day) || !Number.isInteger(score) || score < 0 || score > 20) {
        return json({ error: 'bad params' }, 400, cors);
    }
    return json(await computePercentile(env, day, score), 200, cors);
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
