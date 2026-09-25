// Fallback pro `corner-shape: squircle` (style.css) v prohlížečích, co ji
// ještě neumí (Safari/WebKit, k 2026-09 ověřeno na verzi 26). Tam, kde
// nativní CSS podporu má (Chrome/Edge), tenhle skript rovnou skončí — ať se
// práce nedělá dvakrát.
//
// Squircle = superellipse |x/r|^n + |y/r|^n = 1 na každém rohu. Cesta se pro
// každý prvek vypočítá v jeho skutečných pixelech (šířka/výška/rádius každého
// rohu zvlášť) a použije jako `clip-path: path()` (dřív maska, ta ale
// ve WebKitu usekla spodní ret tlačítek, viz apply). Křivka je vždy přesná,
// i na široko-úzkých tlačítkách.
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
    function pathFor(w, h, rTL, rTR, rBR, rBL, ox, oy) {
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
        ox = ox || 0; oy = oy || 0;
        var d = 'M' + pts.map(function (p) { return (p[0] + ox).toFixed(2) + ',' + (p[1] + oy).toFixed(2); }).join('L') + 'Z';
        return d;
    }

    function radiusOf(cs, prop) {
        return parseFloat(cs[prop]) || 0;
    }

    var ro = new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) apply(entries[i].target);
    });

    // Vnější ostré stíny (box-shadow bez rozostření = spodní „ret" tlačítek).
    // Barva může mít čárky uvnitř závorek, proto dělit jen mimo ně.
    function hardShadows(cs) {
        var v = cs.boxShadow;
        if (!v || v === 'none') return [];
        return v.split(/,(?![^(]*\))/).map(function (part) {
            var n = part.replace(/(rgba?|hsla?|color|oklch|lab|lch)\([^)]*\)/g, '').match(/-?[\d.]+px/g) || [];
            return { x: parseFloat(n[0]) || 0, y: parseFloat(n[1]) || 0, blur: parseFloat(n[2]) || 0, inset: /inset/.test(part) };
        }).filter(function (s) { return !s.inset && (s.x || s.y); });
    }

    // Zapisuje se jen změněná cesta: každý zápis clip-path znamená nový
    // přepočet stylu a překreslení prvku.
    function setClip(el, v) {
        if (el.__squircle === v) return;
        el.__squircle = v;
        el.style.clipPath = el.style.webkitClipPath = v;
    }

    function clear(el) { setClip(el, ''); }

    // clip-path, ne mask: maska se ve WebKitu vždy ořízne na okraj boxu
    // (mask-clip: no-clip neumí), takže by spolkla spodní ret tlačítek.
    // Cesta clip-path smí z boxu vyčnívat: tvar + stejný tvar posunutý o každý
    // ostrý stín. Rozostřený stín by se usekl, takový prvek zůstane s obyčejným
    // zaoblením. Vedlejší zisk: clip-path platí i pro klepnutí.
    function apply(el) {
        if (el.matches(SKIP)) return clear(el);
        var cs = getComputedStyle(el);
        var rTL = radiusOf(cs, 'borderTopLeftRadius');
        var rTR = radiusOf(cs, 'borderTopRightRadius');
        var rBR = radiusOf(cs, 'borderBottomRightRadius');
        var rBL = radiusOf(cs, 'borderBottomLeftRadius');
        if (!rTL && !rTR && !rBR && !rBL) return clear(el);
        var w = el.offsetWidth, h = el.offsetHeight;
        if (!w || !h) return;
        var shadows = hardShadows(cs);
        if (shadows.some(function (s) { return s.blur > 0; })) return clear(el);
        var d = [pathFor(w, h, rTL, rTR, rBR, rBL)].concat(shadows.map(function (s) {
            return pathFor(w, h, rTL, rTR, rBR, rBL, s.x, s.y);
        })).join(' ');
        setClip(el, "path('" + d + "')");
    }

    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, SVG: 1, PATH: 1, CIRCLE: 1, LINK: 1, HEAD: 1, TITLE: 1, META: 1 };
    // Ořez usekne i to, co z prvku přesahuje (číslo pod odznakem, oslí uši).
    // Tyhle prvky zůstanou v Safari s obyčejným zaoblením. Výplně ubývajících
    // pruhů mění šířku v každém snímku: ResizeObserver by jim pořád skládal
    // novou masku a Safari ji mezitím zahodí, pruh bliká. Ořízne je rodič.
    var SKIP = '.ach, .ach-medal, .avatar-btn, .time-bar-fill, .ach-bar i';   // .avatar-btn: tužka vyčnívá přes kruh

    function rounded(el) {
        if (SKIP_TAGS[el.tagName] || el.matches(SKIP)) return false;
        var cs = getComputedStyle(el);
        return radiusOf(cs, 'borderTopLeftRadius') || radiusOf(cs, 'borderTopRightRadius') ||
            radiusOf(cs, 'borderBottomRightRadius') || radiusOf(cs, 'borderBottomLeftRadius');
    }

    function each(root, fn) {
        fn(root);
        var all = root.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) fn(all[i]);
    }

    // Prvek se sleduje jednou; první výpočet přijde z ResizeObserveru, který
    // hlásí velikost hned po observe. Už sledovaný (změnila se mu třída,
    // a s ní třeba rádius nebo ret) se přepočítá hned.
    var watched = new Set();
    function scan(root) {
        each(root, function (el) {
            if (watched.has(el)) return apply(el);
            if (!rounded(el)) return;
            watched.add(el);
            ro.observe(el);
        });
    }

    // Dřív se po každé změně DOM prošel celý dokument — časovač ji dělá
    // každou sekundu, písmenka každým klepnutím. Teď jen to, co přibylo,
    // zmizelo nebo změnilo třídu. Odebrané prvky se pustí, jinak by je
    // ResizeObserver držel a procházel donekonečna (nová písmenka každé slovo).
    var dirty = new Set(), gone = new Set(), pending = false;
    var mo = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (r.type === 'attributes') dirty.add(r.target);
            for (var j = 0; j < r.addedNodes.length; j++) if (r.addedNodes[j].nodeType === 1) dirty.add(r.addedNodes[j]);
            for (var k = 0; k < r.removedNodes.length; k++) if (r.removedNodes[k].nodeType === 1) gone.add(r.removedNodes[k]);
        }
        if (pending) return;
        pending = true;
        requestAnimationFrame(flush);
    });

    function flush() {
        pending = false;
        gone.forEach(function (root) {
            if (root.isConnected) return;                 // jen přesunutý
            each(root, function (el) { if (watched.delete(el)) ro.unobserve(el); });
        });
        dirty.forEach(function (root) { if (root.isConnected) scan(root); });
        gone.clear();
        dirty.clear();
    }

    // Ořez se počítá z aktuálního stínu. Po změně třídy ale stín často teprve
    // dojíždí přechodem (písmeno po odebrání: z none na ret za 0,08 s), takže
    // by zůstal ořez bez retu a dlaždice by byla dole useknutá. Po doběhnutí
    // přechodu stínu se ořez přepočítá z konečné hodnoty.
    document.addEventListener('transitionend', function (e) {
        if (e.propertyName === 'box-shadow' && watched.has(e.target)) apply(e.target);
    }, true);

    function start() {
        scan(document.body);
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
})();
