// Úspěchy: seznam odznaků a jejich markup. Jeden soubor pro hru (profil),
// worker (veřejný profil /u/) i dev-uspechy.html — vzor jako avatar.js.
//
// Stav hráče `st` je plochý objekt počtů; každý odznak čte jeden klíč `v`
// a odemkne se na prahu `goal`. Odkud se který klíč bere, říká `how`
// (hráč ho nevidí) a skládá ho achState() v game.js / publicState() níž.
const Achievements = (() => {
    const GROUPS = [
        ['zacatky', 'Začátky'], ['serie', 'Série'], ['den', 'Denní výzva'], ['sbirka', 'Kalendář'],
        ['trenink', 'Trénink'], ['vyznamy', 'Významy'], ['tajne', 'Tajné'],
    ];
    const RARITY = { common: 'Běžný', rare: 'Vzácný', epic: 'Epický', legend: 'Legendární' };
    const DNY = ['den', 'dny', 'dní'], SLOV = ['slovo', 'slova', 'slov'], HLAS = ['hlas', 'hlasy', 'hlasů'];

    const LIST = [
        { id: 'prvni-kolo', g: 'zacatky', r: 'common', icon: 'vlajka', name: 'První kolo', desc: 'Dohraj svou první denní výzvu. Na skóre nezáleží.', v: 'dny', goal: 1, how: 'persist.results, profile_days' },
        { id: 'nova-tvar', g: 'zacatky', r: 'common', icon: 'avatar', name: 'Nová tvář', desc: 'Poskládej si vlastního avatara v úpravě profilu.', v: 'avatar', goal: 1, how: 'persist.avatar / users.avatar (uloží se jen v úpravě profilu)' },
        { id: 'rozcvicka', g: 'zacatky', r: 'common', icon: 'lehka', num: '5', name: 'Rozcvička', desc: 'Uhodni v tréninku 5 slov v řadě.', v: 'treninkRada', goal: 5, unit: SLOV, how: 'persist.practiceBestRun ≥ 5 (nejdelší „N v řadě")' },
        { id: 'chlouba', g: 'zacatky', r: 'common', icon: 'sdilet', num: '3', name: 'Chlouba', desc: 'Pochlub se kartou dne ze tří různých dnů.', v: 'sdileno', goal: 3, unit: DNY, how: 'persist.ach.sdileno = počet dní se sdílenou kartou (shareCardFile), sdilenoDen hlídá jeden za den' },

        { id: 'rozjezd', g: 'serie', r: 'common', icon: 'plamen-zivy', num: '3', name: 'Rozjezd', desc: 'Hraj denní výzvu 3 dny v kuse.', v: 'serie', goal: 3, unit: DNY, how: 'nejdelší řada odehraných dní: persist.bestStreak / longestRun(results), na serveru stats().nejdelsi' },
        { id: 'tyden', g: 'serie', r: 'rare', icon: 'plamen-zivy', num: '7', name: 'Týden v kuse', desc: 'Hraj denní výzvu 7 dní v kuse.', v: 'serie', goal: 7, unit: DNY, how: 'nejdelší řada odehraných dní ≥ 7' },
        { id: 'mesic', g: 'serie', r: 'epic', icon: 'plamen-zivy', num: '30', name: 'Měsíc v kuse', desc: 'Hraj denní výzvu 30 dní v kuse.', v: 'serie', goal: 30, unit: DNY, how: 'nejdelší řada odehraných dní ≥ 30' },
        { id: 'stovka', g: 'serie', r: 'legend', icon: 'plamen-zivy', num: '100', name: 'Stovka', desc: 'Hraj denní výzvu 100 dní v kuse.', v: 'serie', goal: 100, unit: DNY, how: 'nejdelší řada odehraných dní ≥ 100' },

        { id: 'dvacitka', g: 'den', r: 'rare', icon: 'koruna', num: '20', name: 'Dvacítka', desc: 'Slož za jeden den všech 20 slov.', v: 'perfekt', goal: 1, how: 'počet dní s 20/20' },
        { id: 'hattrick', g: 'den', r: 'epic', icon: 'koruna', num: '3×', name: 'Hattrick', desc: 'Dej všech 20 slov tři dny po sobě.', v: 'perfektSerie', goal: 3, unit: DNY, how: 'longestRun(results) jen přes dny 20/20' },
        { id: 'cista-prace', g: 'den', r: 'epic', icon: 'terc', name: 'Čistá práce', desc: 'Dej všech 20 slov bez jediného chybného pokusu.', v: 'cisty', goal: 1, how: 'persist.day.wrong = 0 v perfektním dni' },
        { id: 'zpatky', g: 'den', r: 'rare', icon: 'raketa', name: 'Zpátky ve hře', desc: 'Po dni bez trofeje (8 slov a méně) dej hned další den aspoň 17.', v: 'fenix', goal: 1, how: 'persist.results dvou po sobě jdoucích dnů' },

        // Cíl denní výzvy je nasbírat všech 365 dní. Id zůstala ze „slov“:
        // 100 / 1000 / 7300 slov jsou přesně 5 / 50 / 365 dní, získané nezmizí.
        { id: 'sto-slov', g: 'sbirka', r: 'common', icon: 'kalendar', num: '5', name: 'Pět dní', desc: 'Odehraj 5 dní denní výzvy.', v: 'dny', goal: 5, unit: DNY, how: 'odehrané dny (klíče persist.results, max 365)' },
        { id: 'tisicovka', g: 'sbirka', r: 'epic', icon: 'kalendar', num: '50', name: 'Padesátka', desc: 'Odehraj 50 dní denní výzvy.', v: 'dny', goal: 50, unit: DNY, how: 'odehrané dny ≥ 50' },
        { id: 'cely-slovnik', g: 'sbirka', r: 'legend', icon: 'trofej', num: '365', name: 'Celý rok', desc: 'Odehraj všech 365 dní denní výzvy. Co propásneš, vrátí se až za rok.', v: 'dny', goal: 365, unit: DNY, how: 'odehrané dny = 365 (všechny indexy dne)' },

        { id: 'posilovna', g: 'trenink', r: 'rare', icon: 'cinka', num: '100', name: 'Posilovna', desc: 'Uhodni v tréninku 100 slov.', v: 'trenink', goal: 100, unit: SLOV, how: 'persist.practiceWords' },
        { id: 'v-razi', g: 'trenink', r: 'rare', icon: 'hvezda', num: '20', name: 'V ráži', desc: 'Uhodni v tréninku 20 slov v řadě.', v: 'treninkRada', goal: 20, unit: SLOV, how: 'persist.practiceBestRun (nejdelší „N v řadě")' },
        { id: 'tezka-vaha', g: 'trenink', r: 'epic', icon: 'tezka', num: '50', name: 'Těžká váha', desc: 'Uhodni 50 slov na Těžkou obtížnost.', v: 'tezka', goal: 50, unit: SLOV, how: 'persist.practiceHard' },
        { id: 'bleskovka', g: 'trenink', r: 'rare', icon: 'blesk', name: 'Bleskovka', desc: 'Slož slovo do 3 sekund.', v: 'blesk', goal: 1, how: 'persist.ach.blesk: uběhlo ≤ 3 s při uhodnutí (trénink i den)' },

        { id: 'pisalek', g: 'vyznamy', r: 'common', icon: 'tuzka', name: 'Pisálek', desc: 'Napiš svůj první význam slova.', v: 'vyznamu', goal: 1, how: 'points().vyznamu' },
        { id: 'palec', g: 'vyznamy', r: 'common', icon: 'palec', name: 'Palec nahoru', desc: 'Získej první hlas pro svůj význam.', v: 'ziskanych', goal: 1, unit: HLAS, how: 'points().ziskanychHlasu' },
        { id: 'oblibenec', g: 'vyznamy', r: 'epic', icon: 'srdce-cele', num: '10', name: 'Oblíbenec', desc: 'Získej 10 hlasů pro jeden svůj význam.', v: 'maxHlasu', goal: 10, unit: HLAS, how: 'points().maxHlasu' },
        { id: 'nejlepsi', g: 'vyznamy', r: 'rare', icon: 'medaile', name: 'Nejlepší výklad', desc: 'Tvůj význam porazí ostatní a hra ho u slova ukáže první.', v: 'nejlepsi', goal: 1, how: 'points().nejlepsi' },
        { id: 'porotce', g: 'vyznamy', r: 'common', icon: 'kladivko', num: '25', name: 'Porotce', desc: 'Dej hlas 25 významům.', v: 'danych', goal: 25, unit: HLAS, how: 'points().danychHlasu (strop 10 za den)' },

        { id: 'nocni-sova', g: 'tajne', r: 'rare', icon: 'sova', secret: 'Sovy v noci nespí.', name: 'Noční sova', desc: 'Dohraj denní výzvu mezi půlnocí a čtvrtou ráno.', v: 'sova', goal: 1, how: 'persist.ach.sova: hodina při finishDay' },
        { id: 'na-chlup', g: 'tajne', r: 'rare', icon: 'hodiny', secret: 'Čím hlasitěji buší srdce, tím líp.', name: 'Na chlup', desc: 'Slož slovo v poslední sekundě.', v: 'chlup', goal: 1, how: 'persist.ach.chlup: zbývá 1 s při uhodnutí' },
        { id: 'presmyckar', g: 'tajne', r: 'epic', icon: 'presmycka', secret: 'Ze stejných písmen jde někdy složit víc slov.', name: 'Přesmyčkář', desc: 'Slož v tréninku jiné platné slovo ze stejných písmen.', v: 'presmycka', goal: 1, how: 'persist.ach.presmycka: isAcceptedWord přijal slovo z ALTS' },
    ];

    // Optický střed: o kolik (jednotky viewBoxu 48) leží střed kresby ikony
    // mimo střed plátna — změřeno getBBox(). Medailon ikonu posune zpátky.
    const OFFSET = {
        vlajka: [0, 1], lehka: [0, 4.5], 'plamen-zivy': [-1.7, .9], koruna: [0, 1], raketa: [1.4, -1.7],
        trofej: [0, 1], hvezda: [0, -1.4], tezka: [0, 2.5], tuzka: [.5, 1.9], palec: [-.8, 2.6],
        kladivko: [4.7, .6], sova: [0, 1.5], hodiny: [0, 1.5], presmycka: [0, 1.6],
    };
    const shift = (icon) => {
        const o = OFFSET[icon];
        return o ? ` style="translate: ${+(-o[0] / .48).toFixed(1)}% ${+(-o[1] / .48).toFixed(1)}%"` : '';
    };

    const plural = (n, [one, few, many]) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;
    const val = (a, st) => st[a.v] || 0;
    const done = (a, st) => val(a, st) >= a.goal;
    const pct = (a, st) => Math.min(1, val(a, st) / a.goal);
    const hidden = (a, st) => a.secret && !done(a, st);
    const unitOf = (a, n) => plural(n, a.unit || DNY);

    // `avatar` = hotové SVG z avatar.js (jen z indexů kódu, bez textu hráče).
    function badge(a, st, avatar) {
        const locked = !done(a, st);
        const medal = hidden(a, st) ? '<span class="ach-q">?</span>'
            : a.icon === 'avatar' && avatar ? avatar
            : `<img src="/designs/kostky/${a.icon === 'avatar' ? 'profil' : a.icon}.svg" alt=""${shift(a.icon)}>`;
        const num = a.num && !hidden(a, st) ? `<span class="ach-num">${a.num}</span>` : '';
        return `<span class="ach ach--${locked ? 'locked' : a.r}" aria-hidden="true"><span class="ach-medal">${medal}</span>${num}</span>`;
    }

    // Dlaždice v mřížce. `tag: 'span'` na veřejném profilu (bez JS, neklikací).
    function tile(a, st, { avatar, isNew, tag = 'button' } = {}) {
        const locked = !done(a, st);
        const name = hidden(a, st) ? '???' : a.name;
        const cls = `ach-tile${locked ? ' ach-tile--locked' : ''}${isNew ? ' ach-tile--new' : ''}`;
        const attrs = tag === 'button' ? ` data-ach="${a.id}" aria-label="${name}${locked ? ', zamčeno' : ''}"` : '';
        return `<${tag} class="${cls}"${attrs}>${badge(a, st, avatar)}<span class="ach-name">${name}</span></${tag}>`;
    }

    // Stav, který zná server (veřejný profil): stats() + points() + avatar.
    // Odznaky jen z klienta (sdílení, rychlost, …) tam zůstanou zamčené.
    const publicState = (s, p, hasAvatar) => ({
        dny: s.dny, serie: s.nejdelsi, perfekt: s.perfektnich, avatar: hasAvatar ? 1 : 0,
        trenink: p.slovTreninku, vyznamu: p.vyznamu, ziskanych: p.ziskanychHlasu, maxHlasu: p.maxHlasu,
        nejlepsi: p.nejlepsi, danych: p.danychHlasu,
    });

    return { GROUPS, RARITY, LIST, DNY, plural, val, done, pct, hidden, unitOf, badge, tile, publicState };
})();

if (typeof module === 'object') module.exports = Achievements;   // worker (esbuild) a test.mjs
