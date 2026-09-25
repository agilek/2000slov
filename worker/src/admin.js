// Správa hry (/admin, stránka public/admin.html): nahlášené a skryté významy,
// hráči a pár čísel. Nahrazuje ruční SQL z OTEVRENE-OTAZKY.md.
//
// Kdo je správce, určuje ADMIN_EMAILS: e-maily oddělené čárkou, nasazené jako
// secret (`npx wrangler secret put ADMIN_EMAILS`). V DB e-mail není, jen hash
// s pepřem, proto se porovnávají hashe. Správce se přihlásí normálně ve hře,
// /admin pak pozná jeho session. Pro všechny ostatní (i bez ADMIN_EMAILS)
// /api/admin/* neexistuje: 404, stejně jako neznámá cesta.

import { json, readJson, badJson } from './http.js';
import { currentUser, peppered, normalizeEmail, HANDLE_RE } from './auth.js';
import { dropDefCache } from './defcache.js';

const PAGE = 50;
const EPOCH = Date.UTC(2026, 8, 21);                  // den 1 v results.day, viz handleSubmit

async function adminUser(request, env) {
    const emails = String(env.ADMIN_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean);
    if (!emails.length) return null;
    const user = await currentUser(request, env);
    if (!user) return null;
    const hashes = await Promise.all(emails.map(e => peppered(env, e)));
    return hashes.includes(user.email_hash) ? user : null;
}

const guard = (fn) => async (request, env, url, ctx) => {
    const me = await adminUser(request, env);
    return me ? fn(request, env, url, ctx, me) : json({ error: 'not found' }, 404);
};

const offsetOf = (url) => Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0);
// Hledání přes LIKE: % a _ z dotazu jsou obyčejné znaky.
const like = (q) => '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
const dateOfDay = (day) => new Date(EPOCH + (day - 1) * 86400000).toISOString().slice(0, 10);

// Čísla na úvod a posledních 7 dní denní výzvy.
async function overview(request, env, url, ctx, me) {
    const [counts, { results: days }] = await Promise.all([
        env.DB.prepare(`SELECT
            (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM users WHERE banned = 1) AS banned,
            (SELECT COUNT(*) FROM definitions) AS defs,
            (SELECT COUNT(*) FROM definitions WHERE hidden = 1) AS hidden,
            (SELECT COUNT(*) FROM definitions WHERE hidden = 0 AND reports > 0) AS reported,
            (SELECT COUNT(*) FROM votes) AS votes,
            (SELECT COUNT(DISTINCT client_id) FROM results) AS devices,
            (SELECT COUNT(*) FROM subscriptions) AS subscriptions`).bind().first(),
        env.DB.prepare(`SELECT day, COUNT(*) AS players, ROUND(AVG(score), 1) AS avg,
            SUM(score = 20) AS perfect FROM results GROUP BY day ORDER BY day DESC LIMIT 7`).bind().all(),
    ]);
    return json({ me: me.handle, counts, days: days.map(d => ({ ...d, date: dateOfDay(d.day) })) }, 200);
}

// Významy: ?filter=review (nahlášené a skryté), ?user=<id> (jednoho hráče),
// jinak nejnovější; ?q= hledá ve slově, autorovi i textu.
async function listDefs(request, env, url) {
    const filter = url.searchParams.get('filter') || '';
    const userId = url.searchParams.get('user') || '';
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const where = [], args = [];
    if (filter === 'review') where.push('(d.hidden = 1 OR d.reports > 0)');
    if (userId) { args.push(userId); where.push(`d.user_id = ?${args.length}`); }
    if (q) {
        args.push(like(q));
        const n = args.length;
        where.push(`(d.word LIKE ?${n} ESCAPE '\\' OR lower(d.author) LIKE ?${n} ESCAPE '\\' OR lower(d.text) LIKE ?${n} ESCAPE '\\')`);
    }
    args.push(PAGE + 1, offsetOf(url));
    const { results } = await env.DB.prepare(`
        SELECT d.id, d.word, d.text, d.author, d.user_id, d.votes, d.reports, d.hidden, d.created_at,
               u.banned AS author_banned,
               (SELECT group_concat(COALESCE(ru.handle, r.client_id), ', ') FROM reports r
                  LEFT JOIN users ru ON ru.id = r.client_id WHERE r.definition_id = d.id) AS reporters
        FROM definitions d LEFT JOIN users u ON u.id = d.user_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY ${filter === 'review' ? 'd.hidden ASC, d.reports DESC, ' : ''}d.created_at DESC
        LIMIT ?${args.length - 1} OFFSET ?${args.length}`).bind(...args).all();
    return json({ defs: results.slice(0, PAGE), more: results.length > PAGE }, 200);
}

// Hráči s účtem, nejnovější první; ?q= hledá v přezdívce (nebo přesné id).
// `reportsMade` = kolik významů sám nahlásil (tři účty skryjí cokoli).
async function listUsers(request, env, url) {
    const q = (url.searchParams.get('q') || '').trim();
    const { results } = await env.DB.prepare(`
        SELECT u.id, u.handle, u.created_at, u.banned, u.hide_profile,
               (SELECT COUNT(*) FROM definitions WHERE user_id = u.id) AS defs,
               (SELECT COUNT(*) FROM definitions WHERE user_id = u.id AND hidden = 1) AS hidden,
               (SELECT COALESCE(SUM(reports), 0) FROM definitions WHERE user_id = u.id) AS reports,
               (SELECT COUNT(*) FROM reports WHERE client_id = u.id) AS reportsMade,
               (SELECT MAX(played_on) FROM profile_days WHERE user_id = u.id) AS lastPlayed
        FROM users u
        WHERE ?1 = '' OR u.handle_lc LIKE ?2 ESCAPE '\\' OR u.id = ?1
        ORDER BY u.created_at DESC LIMIT ?3 OFFSET ?4`)
        .bind(q, like(q.toLowerCase()), PAGE + 1, offsetOf(url)).all();
    return json({ users: results.slice(0, PAGE), more: results.length > PAGE }, 200);
}

// { id, action: 'hide' | 'show' | 'delete' }
// Vrácení smaže i nahlášení: jinak by stačilo jedno další a význam se skryje znovu.
async function defAction(request, env, url, ctx) {
    const body = await readJson(request);
    if (!body) return badJson();
    const { id, action } = body;
    const row = typeof id === 'string' && await env.DB.prepare('SELECT word FROM definitions WHERE id = ?1').bind(id).first();
    if (!row) return json({ error: 'Význam nenalezen.' }, 404);
    const stmts = {
        hide: ['UPDATE definitions SET hidden = 1 WHERE id = ?1'],
        show: ['DELETE FROM reports WHERE definition_id = ?1',
               'UPDATE definitions SET hidden = 0, reports = 0 WHERE id = ?1'],
        delete: ['DELETE FROM votes WHERE definition_id = ?1',
                 'DELETE FROM reports WHERE definition_id = ?1',
                 'DELETE FROM definitions WHERE id = ?1'],
    }[action];
    if (!stmts) return json({ error: 'bad params' }, 400);
    await env.DB.batch(stmts.map(q => env.DB.prepare(q).bind(id)));
    await dropDefCache(row.word, ctx);
    return json({ ok: true }, 200);
}

// { id, action: 'ban' | 'unban' | 'hideProfile' | 'showProfile' | 'rename', handle }
// Blokace odhlásí všechna zařízení a skryje hráčovy významy. Odblokování je
// nevrací, skryté mohly být i po nahlášení; vrátit jde každý zvlášť.
async function userAction(request, env, url, ctx, me) {
    const body = await readJson(request);
    if (!body) return badJson();
    const { id, action } = body;
    const user = typeof id === 'string' && await env.DB.prepare('SELECT id FROM users WHERE id = ?1').bind(id).first();
    if (!user) return json({ error: 'Hráč nenalezen.' }, 404);
    if (id === me.id && (action === 'ban' || action === 'hideProfile')) {
        return json({ error: 'Sám sebe zablokovat ani skrýt nejde.' }, 400);
    }
    const prep = (q, ...a) => env.DB.prepare(q).bind(...a);
    if (action === 'ban') {
        const { results: words } = await prep('SELECT DISTINCT word FROM definitions WHERE user_id = ?1 AND hidden = 0', id).all();
        await env.DB.batch([
            prep('UPDATE users SET banned = 1 WHERE id = ?1', id),
            prep('DELETE FROM sessions WHERE user_id = ?1', id),
            prep('UPDATE definitions SET hidden = 1 WHERE user_id = ?1', id),
        ]);
        await Promise.all(words.map(w => dropDefCache(w.word, ctx)));
    } else if (action === 'unban' || action === 'hideProfile' || action === 'showProfile') {
        const [col, val] = { unban: ['banned', 0], hideProfile: ['hide_profile', 1], showProfile: ['hide_profile', 0] }[action];
        await prep(`UPDATE users SET ${col} = ?1 WHERE id = ?2`, val, id).run();
    } else if (action === 'rename') {
        const handle = String(body.handle || '').trim();
        if (!HANDLE_RE.test(handle)) return json({ error: 'Přezdívka: 3–20 znaků, bez mezer.' }, 400);
        try {
            await prep('UPDATE users SET handle = ?1, handle_lc = ?2 WHERE id = ?3', handle, handle.toLowerCase(), id).run();
        } catch (e) {
            return json({ error: 'Tuhle přezdívku už někdo má.' }, 409);
        }
        const { results: words } = await prep('SELECT DISTINCT word FROM definitions WHERE user_id = ?1', id).all();
        await prep('UPDATE definitions SET author = ?1 WHERE user_id = ?2', handle, id).run();
        await Promise.all(words.map(w => dropDefCache(w.word, ctx)));
    } else {
        return json({ error: 'bad params' }, 400);
    }
    return json({ ok: true }, 200);
}

export const ADMIN_ROUTES = {
    'GET /api/admin/overview': guard(overview),
    'GET /api/admin/defs': guard(listDefs),
    'GET /api/admin/users': guard(listUsers),
    'POST /api/admin/def': guard(defAction),
    'POST /api/admin/user': guard(userAction),
};
