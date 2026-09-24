// Avatar hráče: barevný tvar s obličejem, poskládaný náhodně z tvaru, barvy,
// očí a pusy. Ukládá se jen kód „tvar-barva-oči-pusa" (indexy do polí níž) —
// v localStorage a u účtu v users.avatar. Soubor běží v prohlížeči (globální
// Avatar) i ve workeru (veřejný profil /u/), proto žádné DOM API.
// Pořadí v polích je součást uložených kódů: nové položky jen na konec.
const Avatar = (() => {
    const INK = '#0b1215';        // skoro černá, tmavší než tmavé pozadí hry (#131f24)
    const TONGUE = '#ff6f91';
    const f = (n) => +n.toFixed(1);

    // Mnohoúhelník se zaoblenými rohy: roh = kvadratická křivka s řídicím bodem ve vrcholu.
    function rounded(pts, r) {
        const n = pts.length;
        return pts.map(([x, y], i) => {
            const cut = ([qx, qy]) => {
                const len = Math.hypot(qx - x, qy - y), t = Math.min(r, len / 2) / len;
                return `${f(x + (qx - x) * t)} ${f(y + (qy - y) * t)}`;
            };
            return `${i ? 'L' : 'M'}${cut(pts[(i + n - 1) % n])}Q${x} ${y} ${cut(pts[(i + 1) % n])}`;
        }).join('') + 'Z';
    }
    // Pravidelný n-úhelník, u hvězdy se poloměry střídají. První vrchol nahoře.
    const ngon = (n, radii, cy = 50, rot = 0) => Array.from({ length: n }, (_, i) => {
        const r = [].concat(radii)[i % [].concat(radii).length];
        const a = (i / n + rot) * 2 * Math.PI - Math.PI / 2;
        return [f(50 + r * Math.cos(a)), f(cy + r * Math.sin(a))];
    });
    // Kruh z oblouků vyboulených ven (květ, odznak, jetel); bulge 1 = půlkruhy.
    function scallop(n, R, bulge) {
        const p = ngon(n, R, 50, .5 / n);
        const rr = f(R * Math.sin(Math.PI / n) * bulge);
        return `M${p[n - 1].join(' ')}` + p.map(q => `A${rr} ${rr} 0 0 1 ${q.join(' ')}`).join('') + 'Z';
    }
    // Archimédova spirála jako lomená čára (drážka na lízátku).
    const spiral = Array.from({ length: 60 }, (_, i) => {
        const a = i / 59 * 4 * Math.PI, r = 5 + a * 2.4;
        return `${i ? 'L' : 'M'}${f(50 + r * Math.cos(a))} ${f(50 + r * Math.sin(a))}`;
    }).join('');

    // Tvar = SVG obsah v poli 100×100 + kam a jak velký obličej: [x, y, měřítko].
    // I s retem (kopie o 5 níž) se musí vejít do 0–100, jinak ho SVG usekne —
    // hlídá to dev-styleguide.html. Obličej má ±24 na šířku a -17…+22 na výšku.
    const S = (d, face, extra = '') => ({ body: `<path d="${d}"${extra}/>`, face });
    const SHAPES = [
        S('M50 5a43 43 0 1 1 0 86a43 43 0 1 1 0-86z', [50, 49, 1.24]),                        // kruh
        S(rounded([[6, 5], [94, 5], [94, 91], [6, 91]], 26), [50, 49, 1.24]),                  // čtverec
        S(rounded([[50, 4], [97, 90], [3, 90]], 16), [50, 65, 0.94]),                             // trojúhelník
        S(rounded([[28, 3], [86, 3], [70, 32], [96, 32], [36, 97], [48, 64], [6, 64]], 7), [50, 48, .8]),  // blesk
        { body: `<circle cx="50" cy="48" r="43"/><path d="${spiral}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-linecap="round" transform="translate(0 -2)"/>`, face: [50, 49, 1.24] },  // lízátko
        S('M16 91Q6 91 6 80C6 38 24 6 50 6S94 38 94 80Q94 91 84 91Z', [50, 58, 1.18]),           // kopule
        S(rounded(ngon(10, [50, 31], 55), 8), [50, 58, .84]),                                   // hvězda
        S('M50 90C22 72 4 54 4 32C4 16 16 6 29 6C39 6 46 12 50 20C54 12 61 6 71 6C84 6 96 16 96 32C96 54 78 72 50 90Z', [50, 45, 1.06]),  // srdce
        S(scallop(6, 31, 1), [50, 50, 1]),                                                     // květ
        S('M26 88C12 88 4 78 4 66C4 54 13 46 24 46C24 30 36 18 51 18C64 18 74 27 77 39C88 40 96 50 96 62C96 77 86 88 72 88Z', [52, 63, 1.06]),  // mrak
        S(rounded(ngon(6, 48, 48), 12), [50, 49, 1.18]),                                           // šestiúhelník
        S(rounded(ngon(5, 49, 53), 12), [50, 56, 1.06]),                                          // pětiúhelník
        S(rounded(ngon(4, 49, 48), 14), [50, 49, 0.94]),                                          // kosočtverec
        S(rounded(ngon(8, 47, 48, 1 / 16), 10), [50, 49, 1.24]),                                // osmiúhelník
        S('M50 5C74 5 92 38 92 60C92 80 74 92 50 92S8 80 8 60C8 38 26 5 50 5Z', [50, 58, 1.18]),  // vejce
        S(rounded([[4, 20], [96, 20], [96, 80], [4, 80]], 30), [50, 50, 1.18]),                   // pilulka
        S('M8 44A42 42 0 0 1 92 44V80Q92 90 82 90H18Q8 90 8 80Z', [50, 55, 1.24]),             // oblouk
        S('M10 46A40 40 0 0 1 90 46V86Q90 92 83 89Q77 82 70 89Q63 95 57 89Q50 82 43 89Q37 95 30 89Q23 82 17 89Q10 92 10 86Z', [50, 50, 1.12]),  // duch
        S('M50 4C62 22 88 42 88 62C88 80 72 92 50 92S12 80 12 62C12 42 38 22 50 4Z', [50, 63, 1.06]),  // kapka
        S(scallop(12, 40, 1.3), [50, 49, 1.12]),                                                    // odznak
        S(rounded(ngon(8, [47, 28], 48), 9), [50, 48, .75]),                                        // jiskra
        S(rounded([[32, 3], [68, 3], [68, 30], [95, 30], [95, 66], [68, 66], [68, 93], [32, 93], [32, 66], [5, 66], [5, 30], [32, 30]], 10), [50, 48, 0.94]),  // plus
        S('M50 9C81 27 86 60 50 86C14 60 19 27 50 9Z', [50, 49, .86], ' transform="rotate(-18 50 47)"'),  // list
        S('M50 5L88 16Q92 17 92 22C92 58 76 80 50 92C24 80 8 58 8 22Q8 17 12 16Z', [50, 44, 1.12]),  // štít
        S('M4 34Q4 26 12 26H88Q96 26 96 34A46 46 0 0 1 4 34Z', [50, 48, 1.12]),                 // miska
        S('M52 6C76 4 94 22 92 46C90 70 82 90 54 91C26 92 6 76 8 50C10 26 28 8 52 6Z', [50, 49, 1.18]),  // brambora
        S('M48 6C64 2 70 16 82 22C96 30 96 48 90 60C84 74 90 88 70 90C54 92 44 84 30 88C12 92 4 76 8 60C12 46 4 34 14 22C22 12 34 10 48 6Z', [50, 49, 1.12]),  // kaňka
        S('M30 12C44 4 58 14 70 12C86 10 96 24 94 44C92 70 74 90 48 90C22 90 6 72 6 48C6 30 16 20 30 12Z', [50, 51, 1.18]),  // fazole
        S('M14 10L36 26Q50 22 64 26L86 10Q92 7 92 14L90 40Q96 52 94 62C92 80 74 92 50 92S8 80 6 62Q4 52 10 40L8 14Q8 7 14 10Z', [50, 60, 1.12]),  // kočka
        { body: '<circle cx="23" cy="22" r="15"/><circle cx="77" cy="22" r="15"/><circle cx="50" cy="55" r="37"/>', face: [50, 59, 1.12] },  // medvěd
        S('M20 8H80Q94 8 94 22V60Q94 74 80 74H44L24 90Q20 93 20 88V74Q6 74 6 60V22Q6 8 20 8Z', [50, 42, 1.12]),  // bublina
        S(rounded([[50, 5], [94, 44], [94, 91], [6, 91], [6, 44]], 10), [50, 64, 1.12]),       // domek
        S(rounded(ngon(32, [45, 45, 36, 36], 47, -1 / 64), 3), [50, 48, .95]),                 // ozubené kolo
        S(scallop(4, 30, 1), [50, 50, 1.05]),                                                     // jetel
        S(rounded([[24, 8], [76, 8], [96, 90], [4, 90]], 14), [50, 52, 1.18]),                    // lichoběžník
        S(rounded([[28, 10], [97, 10], [72, 88], [3, 88]], 12), [50, 49, 1.12]),                // rovnoběžník
        S(rounded([[11, 8], [89, 8], [89, 86], [11, 86]], 22), [50, 47, 1.05], ' transform="rotate(-10 50 47)"'),  // nakřivo
        S(rounded([[3, 7], [97, 7], [50, 92]], 16), [50, 34, 0.94]),                              // trojúhelník dolů
        { body: '<path d="M50 22C60 14 90 12 92 44C94 72 72 94 58 90C54 89 46 89 42 90C28 94 6 72 8 44C10 12 40 14 50 22Z"/><path d="M52 20C52 10 60 4 70 4C70 14 62 20 52 20Z"/>', face: [50, 55, 1.12] },  // jablko
        S(rounded([[20, 4], [80, 4], [80, 92], [20, 92]], 30), [50, 46, 1.18]),                   // tobolka
    ];

    // Výplň a ret (tmavší spodek jako u dlaždic Kostek). Světlejší než
    // barvy tlačítek, ať na nich čte tmavý obličej.
    const COLORS = [
        ['#7ed957', '#5cb838'],   // zelená
        ['#6cc3ff', '#3b9fe0'],   // modrá
        ['#ffc93c', '#e0a41a'],   // zlatá
        ['#ffa24c', '#e57f22'],   // oranžová
        ['#ff7b7b', '#e05555'],   // korálová
        ['#ffa3d7', '#e57bb8'],   // růžová
        ['#c99bff', '#a674ea'],   // fialová
        ['#4fd8c4', '#27b3a0'],   // tyrkysová
        ['#c6ec4f', '#a0c72a'],   // limetková
        ['#9fb0ff', '#7a8be6'],   // levandulová
    ];

    const dot = (r, x = 0, y = 0) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}" stroke="none"/>`;
    const white = (r, x = 0, y = 0) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="none"/>`;
    const happy = '<path d="M-5 1.5Q0 -5 5 1.5"/>';

    // Oko = levé oko kolem [0,0]; pravé je jeho zrcadlo. [levé, pravé] se
    // nezrcadlí (pohled stranou, mrknutí), { both } se kreslí jednou doprostřed.
    const EYES = [
        dot(3.6),                                                                // tečky
        dot(4.6) + white(1.5, 1.4, -1.6),                                        // tečky s leskem
        happy,                                                                   // šťastně zavřené
        '<path d="M-5 -1.5Q0 4.5 5 -1.5"/>',                                    // blaženě zavřené
        '<path d="M-4.5 0H4.5"/>',                                              // čárky
        white(7) + dot(3.6, 0, -3),                                              // koukají nahoru
        Array(2).fill(white(7) + dot(3.6, -2.8, -1.4)),                          // koukají stranou
        dot(3.6, 0, 1.5) + '<path d="M-6 -8L5 -4"/>',                           // naštvané
        dot(3.6, 0, 1) + '<path d="M-6 -4.5L5 -8.5"/>',                         // ustarané
        '<path d="M-4 -4.5L3.5 0L-4 4.5"/>',                                    // přimhouřené > <
        '<path d="M-4 -4L4 4M4 -4L-4 4"/>',                                     // křížky
        `<ellipse rx="3.4" ry="5" fill="${INK}" stroke="none"/>` + white(1.2, 1, -2.2),  // ovály
        `<path d="M-5.5 -1H5.5"/><path d="M-5 -1A5 5 0 0 0 5 -1Z" fill="${INK}"/>`,      // znuděné
        white(6) + dot(2.2) + '<path d="M-5 -10.5Q0 -13.5 5 -10.5"/>',          // překvapené
        { both: `<circle cx="-13" r="7.5" fill="#fff"/><circle cx="13" r="7.5" fill="#fff"/><path d="M-5.5 0Q0 -3 5.5 0"/>${dot(2.6, -12)}${dot(2.6, 14)}` },  // brýle
        { both: `<path d="M-21 -5H21M-5 -4Q0 -6 5 -4"/><rect x="-21" y="-5" width="15" height="10" rx="4" fill="${INK}"/><rect x="6" y="-5" width="15" height="10" rx="4" fill="${INK}"/>` },  // sluneční brýle
        [dot(3.6), happy],                                                       // mrknutí
        `<path d="M0 4.5C-6 0 -6.5 -4.5 -3.3 -4.5C-1.5 -4.5 0 -3 0 -2C0 -3 1.5 -4.5 3.3 -4.5C6.5 -4.5 6 0 0 4.5Z" fill="${INK}" stroke="none"/>`,  // srdíčka
    ];

    // Pusa kolem [0,0], sedí 18 pod očima.
    const MOUTHS = [
        '<path d="M-10 -2Q0 8 10 -2"/>',                                        // úsměv
        '<path d="M-14 -3Q0 11 14 -3"/>',                                       // široký úsměv
        '<path d="M-5 -1Q0 3.5 5 -1"/>',                                        // úsměvík
        '<path d="M-9 3Q0 -5 9 3"/>',                                           // smutná
        '<path d="M-7 0H7"/>',                                                  // rovná
        '<path d="M-11 0Q-5.5 -5 0 0T11 0"/>',                                  // vlnka
        '<ellipse rx="3.2" ry="4"/>',                                           // o
        `<ellipse rx="5" ry="6.5" fill="${INK}" stroke="none"/>`,              // O
        `<path d="M-10 -4H10Q10 8 0 8Q-10 8 -10 -4Z" fill="${INK}"/><path d="M-5 5Q0 1.5 5 5Q3.5 7 0 7Q-3.5 7 -5 5Z" fill="${TONGUE}" stroke="none"/>`,  // smích
        `<path d="M-4 1.5V5.5A4 4 0 0 0 4 5.5V1.5" fill="${TONGUE}"/><path d="M-10 -2Q0 6 10 -2"/>`,  // jazyk
        '<path d="M-9 -2Q-4.5 4 0 -1Q4.5 4 9 -2"/>',                           // kočičí
        '<rect x="-9" y="-4" width="18" height="8" rx="3" fill="#fff"/><path d="M-3 -4V4M3 -4V4"/>',  // zuby
        '<path d="M-8 1Q1 4 9 -4"/>',                                           // úšklebek
        '<path d="M-2 -5Q4 -4.5 0 -1Q4 2.5 -2 3"/>',                           // pusinka
        '<path d="M-10 1L-5 -2L0 1L5 -2L10 1"/>',                              // cik-cak
        '<path d="M-7 1L-4.5 7.5L-2 1ZM2 1L4.5 7.5L7 1Z" fill="#fff" stroke-width="1.8"/><path d="M-10 -2Q0 7 10 -2"/>',  // upírek (tesáky pod rtem)
        '<path d="M-4 0H4"/>',                                                  // čárka
        '<path d="M-5 2Q0 -2 5 2"/>',                                           // smutníček
    ];

    // Indexy očí, co při mrknutí srolují (otevřené tečky/kolečka). Zavřené
    // oblouky, čárky, přimhouřené, křížky a znuděné mrkání přeskočí — jsou
    // "zavřené" už staticky. Brýle (14, 15) mají vlastní jemný pohyb níž.
    const BLINK_EYES = new Set([0, 1, 5, 6, 7, 8, 11, 13, 16, 17]);

    const EX = 13, EY = -7, MY = 11;
    // i = index do EYES; animace jde na obalující <g class="av-…">, protože
    // CSS transform by jinak přepsal SVG transform atribut skupiny okolo.
    function eyes(v, i) {
        if (v.both) return `<g transform="translate(0 ${EY})"><g class="av-glasses">${v.both}</g></g>`;
        const [l, r] = Array.isArray(v) ? v : [v, v];
        const blink = BLINK_EYES.has(i) ? ' av-blink' : '';
        // Mrknutí (16): levé oko otevřené mrká, pravé je zavřený oblouk.
        const rBlink = i === 16 ? '' : blink;
        return `<g transform="translate(${-EX} ${EY})"><g class="av-eye${blink}">${l}</g></g>`
            + `<g transform="translate(${EX} ${EY})${Array.isArray(v) ? '' : ' scale(-1 1)'}"><g class="av-eye${rBlink}">${r}</g></g>`;
    }

    const LISTS = [SHAPES, COLORS, EYES, MOUTHS];
    const parts = (code) => String(code).split('-').map(Number);
    const valid = (code) => /^\d{1,3}(-\d{1,3}){3}$/.test(code) && parts(code).every((n, i) => n < LISTS[i].length);
    const random = () => LISTS.map(l => Math.floor(Math.random() * l.length)).join('-');

    // Načasování animací je odvozené z kódu (ne Math.random), ať se server i
    // klient vykreslí stejně a víc avatarů na obrazovce nemrká souběžně.
    function timingStyle(s, c, e, m) {
        const seed1 = (s * 7 + c * 13 + e * 29 + m * 41) % 97;
        const seed2 = (s * 11 + c * 17 + e * 23 + m * 37) % 89;
        const bd = f(4 + (seed1 % 40) / 10);       // mrkání: cyklus 4.0–7.9s
        const be = f(-(seed1 % 61) / 10);          // 0…-6.0s posun startu
        const md = f(7 + (seed2 % 50) / 10);       // pusa/brýle: 7.0–11.9s
        const me = f(-(seed2 % 90) / 10);          // 0…-8.9s posun startu
        return `--av-bd:${bd}s;--av-be:${be}s;--av-md:${md}s;--av-me:${me}s`;
    }

    // Neplatný kód (ručně upravené úložiště, položka odebraná z polí) → '',
    // volající pak ukáže iniciálu.
    function svg(code) {
        if (!valid(code)) return '';
        const [s, c, e, m] = parts(code);
        const { body, face: [x, y, k] } = SHAPES[s];
        const [fill, lip] = COLORS[c];
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" style="${timingStyle(s, c, e, m)}">`
            + `<g fill="${lip}" transform="translate(0 5)">${body}</g><g fill="${fill}">${body}</g>`
            + `<g transform="translate(${x} ${y}) scale(${k})" fill="none" stroke="${INK}" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">`
            + `${eyes(EYES[e], e)}<g transform="translate(0 ${MY})"><g class="av-mouth">${MOUTHS[m]}</g></g></g></svg>`;
    }

    return { svg, random, valid, counts: LISTS.map(l => l.length) };
})();

if (typeof module === 'object') module.exports = Avatar;   // worker (esbuild) a test.mjs
