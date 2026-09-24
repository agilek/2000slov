// Odpovědi a čtení těla sdílené všemi moduly workeru. Mimo index.js ze
// stejného důvodu jako validate.js: pojmenovaný export vstupního modulu by
// Cloudflare bral jako handler.

export function json(obj, status = 200, extra) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra || {}),
    });
}

// Tělo požadavku jako objekt, jinak null (rozbitý JSON, pole, číslo…).
export async function readJson(request) {
    try {
        const body = await request.json();
        return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    } catch {
        return null;
    }
}

export const badJson = () => json({ error: 'bad json' }, 400);
