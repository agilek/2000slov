// Fallback pro `corner-shape: squircle` (kostky.css) v prohlížečích, co ji
// ještě neumí (Safari/WebKit, k 2026-09 ověřeno na verzi 26). Tam, kde
// nativní CSS podporu má (Chrome/Edge), tenhle skript rovnou skončí — ať se
// práce nedělá dvakrát.
//
// Squircle = superellipse |x/r|^n + |y/r|^n = 1 na každém rohu. Cesta se pro
// každý prvek vypočítá v jeho skutečných pixelech (šířka/výška/rádius každého
// rohu zvlášť) a použije jako SVG maska — na rozdíl od natažení jedné
// univerzální SVG masky přes celý prvek (`mask-size:100% 100%`, které by na
// široko-úzkých tlačítkách zkreslilo zakřivení) je křivka vždycky přesná.
//
// Známé omezení: CSS maska je čistě vizuální — na rozdíl od `corner-shape`
// (skutečný ořez geometrie) neovlivní hit-testing, takže těsně u rohu jde
// prvek „proklinout" i pár px mimo viditelný tvar. Pro dotykové cíle v téhle
// appce (min. 34–58px) je to neznatelné.
(function () {
    if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('corner-shape', 'squircle')) return;

    var N = 4.5;      // exponent superellipsy — čím vyšší, tím "hranatější" squircle
    var STEPS = 8;     // úseček na jeden rohový oblouk

    function corner(cx, cy, r, xDrivesBy, exSign, eySign) {
        // xDrivesBy: 'cos' nebo 'sin' — která funkce žene souřadnici x (viz komentář u pathFor)
        var pts = [];
        for (var i = 0; i <= STEPS; i++) {
            var t = (i / STEPS) * (Math.PI / 2);
            var c = Math.pow(Math.cos(t), 2 / N) * r;
            var s = Math.pow(Math.sin(t), 2 / N) * r;
            var dx = xDrivesBy === 'cos' ? c : s;
            var dy = xDrivesBy === 'cos' ? s : c;
            pts.push([cx + exSign * dx, cy + eySign * dy]);
        }
        return pts;
    }

    // Čtyři rohy po směru hodin, od tečny na horní hraně u levého rohu.
    // Odvození (proč cos/sin a znaménka) je v DEVLOGu z 2026-09-24.
    function pathFor(w, h, rTL, rTR, rBR, rBL) {
        rTL = Math.min(rTL, w / 2, h / 2);
        rTR = Math.min(rTR, w / 2, h / 2);
        rBR = Math.min(rBR, w / 2, h / 2);
        rBL = Math.min(rBL, w / 2, h / 2);
        var pts = [[rTL, 0]];
        pts.push([w - rTR, 0]);
        if (rTR > 0.5) pts = pts.concat(corner(w - rTR, rTR, rTR, 'sin', 1, -1));
        pts.push([w, h - rBR]);
        if (rBR > 0.5) pts = pts.concat(corner(w - rBR, h - rBR, rBR, 'cos', 1, 1));
        pts.push([rBL, h]);
        if (rBL > 0.5) pts = pts.concat(corner(rBL, h - rBL, rBL, 'sin', -1, 1));
        pts.push([0, rTL]);
        if (rTL > 0.5) pts = pts.concat(corner(rTL, rTL, rTL, 'cos', -1, -1));
        var d = 'M' + pts.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join('L') + 'Z';
        return d;
    }

    function radiusOf(cs, prop) {
        return parseFloat(cs[prop]) || 0;
    }

    var ro = new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) apply(entries[i].target);
    });

    function apply(el) {
        var cs = getComputedStyle(el);
        var rTL = radiusOf(cs, 'borderTopLeftRadius');
        var rTR = radiusOf(cs, 'borderTopRightRadius');
        var rBR = radiusOf(cs, 'borderBottomRightRadius');
        var rBL = radiusOf(cs, 'borderBottomLeftRadius');
        if (!rTL && !rTR && !rBR && !rBL) { el.style.webkitMaskImage = ''; return; }
        var w = el.offsetWidth, h = el.offsetHeight;
        if (!w || !h) return;
        var d = pathFor(w, h, rTL, rTR, rBR, rBL);
        var svg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + h + "'%3E%3Cpath d='" + encodeURIComponent(d) + "' fill='%23000'/%3E%3C/svg%3E";
        el.style.webkitMaskImage = "url(\"" + svg + "\")";
        el.style.maskImage = "url(\"" + svg + "\")";
        el.style.webkitMaskSize = el.style.maskSize = '100% 100%';
        el.style.webkitMaskRepeat = el.style.maskRepeat = 'no-repeat';
    }

    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, SVG: 1, PATH: 1, CIRCLE: 1, LINK: 1, HEAD: 1, TITLE: 1, META: 1 };
    // Maska ořízne i to, co z prvku přesahuje (číslo pod odznakem, oslí uši).
    // Tyhle prvky zůstanou v Safari s obyčejným zaoblením. Výplně ubývajících
    // pruhů mění šířku v každém snímku: ResizeObserver by jim pořád skládal
    // novou masku a Safari ji mezitím zahodí, pruh bliká. Ořízne je rodič.
    var SKIP = '.ach, .ach-medal, .time-bar-fill, .ach-bar i, .ach-mini i';

    function candidates(root) {
        var out = [];
        var all = root.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (SKIP_TAGS[el.tagName] || el.matches(SKIP)) continue;
            var cs = getComputedStyle(el);
            if (radiusOf(cs, 'borderTopLeftRadius') || radiusOf(cs, 'borderTopRightRadius') ||
                radiusOf(cs, 'borderBottomRightRadius') || radiusOf(cs, 'borderBottomLeftRadius')) {
                out.push(el);
            }
        }
        return out;
    }

    function scan(root) {
        candidates(root).forEach(function (el) {
            apply(el);
            ro.observe(el);
        });
    }

    var pending = false;
    var mo = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; scan(document.body); });
    });

    function start() {
        scan(document.body);
        mo.observe(document.body, { childList: true, subtree: true });
    }
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
})();
