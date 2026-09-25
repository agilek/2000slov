// Edge cache významů po jednotlivých slovech. Sdílí ji veřejné /api/defs*
// (index.js) i správa (admin.js). Mimo index.js ze stejného důvodu jako
// validate.js: pojmenovaný export vstupního modulu by Cloudflare bral jako handler.

// Klíč se staví ručně, NIKDY z příchozího requestu — ten nese cookies a dotaz
// clientId a cache by se roztříštila (nebo prosákla mezi hráče).
export const defCacheKey = (w) => new Request(`https://cache.local/def/${encodeURIComponent(w)}`);

// Po zápisu je uložené slovo neplatné. Purge je per-kolo, takže v jiném regionu
// může být až max-age (300 s) stará odpověď — u hobby hry přijatelné.
export async function dropDefCache(word, ctx) {
    if (!word) return;
    const p = caches.default.delete(defCacheKey(word));
    if (ctx) ctx.waitUntil(p); else await p;
}
