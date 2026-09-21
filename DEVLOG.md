# Devlog

## 2026-09-21

### Profil a trénink jako dva rohy úvodní obrazovky
Úvodní obrazovka dostala dvě kulatá tlačítka v horních rozích — vlevo Profil,
vpravo Trénink — a k nim novou obrazovku `#profile` se šipkou zpět, avatarem,
přihlášením, statistikami v mřížce 2×2 a sekcí „Moje významy". Statistiky jsou
skutečné, počítají se z `persist.results` (dní v řadě, odehraných dní, získaných
slov, úspěšnost). Přihlášení a významy zatím jen vysvětlují, že se chystají —
backend pro ně vznikne až v P2/P3 podle plánu.

**Root cause / approach:** Profil je záměrně `.screen`, ne modal: na telefonu se
„další stránka" se šipkou zpět chová jinak než překryv a uživatel to čeká.
Kvůli tomu musel dostat výjimku ze scrollování — `.screen` je zamčená na
`100dvh` s `touch-action:none` a scrollovat směl dosud jen `#result` přes
`:has()` pravidlo. Klávesnicová stráž řešit nemusela: `document.onkeydown`
propouští jen když je aktivní `#game`, takže nová obrazovka je bezpečná zadarmo.
Při kontrole na šířce telefonu se ukázalo, že `welcomeRules` mělo natvrdo `<br>`,
které text trhalo doprostřed slova — zrušeno, ať teče přirozeně.

Poznámka k ověřování: `Emulation.setEmulatedMedia` pro `prefers-color-scheme`
vykreslilo světlý režim rozbitě (světlý text na světlém pozadí), ale byl to
artefakt emulace — `--ink` je ve světlém režimu `#1c1c1e`. Spolehlivé je sáhnout
na `:root[data-theme="light"]`, který v CSS existuje.

### Úklid po přesunu: starý worker smazán, GitHub Pages vypnuté
`slov2000-api` zrušen, Pages odpojené. D1 zůstala nedotčená (1 odběratel,
8 výsledků) — smazání workeru databázi nebere.

**Root cause / approach:** Málem to shodilo push notifikace. **Secrety jsou
per-worker**, takže nový `slov2000` po nasazení neměl `VAPID_PRIVATE_JWK`
(`wrangler secret list` → `[]`) a cron by tiše nic neposlal, zatímco starý worker
ho pořád měl. Klíč se musel nejdřív přenést z `worker/.dev.vars` a ověřit, že
z jeho `x`/`y` sedí veřejný klíč zadrátovaný v `game.js` — jinak by existující
odběry přestaly platit. Teprve pak šlo mazat.
GitHub Pages: `DELETE /repos/:o/:r/pages` odstraní konfiguraci hned (GET vrací
404), ale obsah na `agilek.github.io` ještě chvíli dojíždí z CDN — teardown je
na straně GitHubu asynchronní a nejde uspíšit.

→ No new memory entries.

## 2026-09-21

### P0: hra i API jedou z jednoho Cloudflare Workeru (konec GitHub Pages a CORS)
Statika se přesunula do `public/`, `wrangler.toml` do kořene repa a jeden Worker
teď servíruje obojí — `[assets]` vydá soubory, `run_worker_first = ["/api/*"]`
pošle API do `worker/src/index.js`. Tím je všechno na jedné doméně, takže z workeru
zmizel celý CORS (`ALLOWED_ORIGINS`, `corsHeaders()`, větev `OPTIONS`, parametr
`cors` protažený všemi handlery) a `if` řetěz se zploštil na tabulku `ROUTES`.
GitHub Pages workflow nahradil `cloudflare/wrangler-action`.

**Root cause / approach:** Tohle není kosmetika, ale předpoklad pro účty. Přes dvě
domény (Pages + workers.dev) by session musela být bearer token v `localStorage`,
čitelný jakýmkoli skriptem na stránce — a chystaná funkce začne vykreslovat cizí
text (významy slov) u každého slova. Na jedné doméně je session `HttpOnly` cookie,
kterou JS nepřečte. Vlastní doména k tomu **není potřeba**: `workers.dev` dá stejný
origin hned, doména se navěsí později (nutná je až pro odesílání e-mailů).
CSRF místo CORS hlídá `sameOrigin()` + vyžadovaný `Content-Type: application/json`.

Dva chytáky, na které se dalo naletět:
- `API_BASE` se změnil na prázdný řetězec (relativní cesty), jenže
  `fetchRealPercentile()` začínala `if (!API_BASE) return null;` jako stráž
  „backend není nastavený" — percentily by se tiše vypnuly úplně. Stráž musela pryč.
- `tools/build_words.py` měl `--out` natvrdo `words.js`, takže by po přesunu
  generoval slovník do kořene, kde ho už nikdo neservíruje. Přepnuto na
  `public/words.js` a ověřeno, že výstup je bajt po bajtu stejný.

Ověřeno přes `wrangler dev`: `/` vydá hru, `/api/percentile` i `/api/result` jedou,
odpovědi nemají žádnou `Access-Control-*` hlavičku, zápis s cizím `Origin` dostane
403 a s vlastním 200. V prohlížeči prošla celá denní výzva (20 slov → výsledková
obrazovka, série, zápis do D1) i trénink.

→ No new memory entries.

## 2026-09-21

### Trénink je nekonečný — po nestihnutém slově se sám posune dál
Trénink byl na přežití: první nestihnuté slovo hru ukončilo a vyhodilo
výsledkovou obrazovku s „Trénovat znovu / Zpět". Teď neskončí vůbec — slovo se
odhalí, na místě časovače naskočí odpočet „Další slovo za 3 s" a další slovo
naběhne samo. Správně složené slovo se posouvá hned jako dřív. Jediný východ je
křížek vpravo nahoře. Trénink tím pádem výsledkovou obrazovku vůbec nepoužívá,
takže z ní šly pryč všechny `isPractice` větve i mrtvý DOM (`#failedWord`,
`#practiceAgainBtn`, `#backBtn`) a s nimi i řádek „Díky za hru".

**Root cause / approach:** Odpočet nejde pověsit na okamžik minutí — odhalování
slova po písmenech trvá `délka × 65 ms + 340`, takže odpočet startuje až po něm
a `hold` se zkrátí o 320 ms závěrečného prolnutí; jinak doběhne o sekundu dřív,
než se slovo doopravdy vymění. Druhá věc byla skrytá chyba: zavření tréninku
nezrušilo už naplánované `setTimeout`y, takže `loadWord()` doběhl na uvítací
obrazovce a rozjel časovač na pozadí — a kdyby si hráč mezitím pustil denní
výzvu, přepsal by jí rozehrané slovo. Řeší to `state.gen`: každé nové kolo
(`startGame`, `startPracticeGame`, `exitPractice`) číslo zvýší a naplánované
callbacky se podle něj poznají a zahodí.

Vedlejší nález: `index.html` a `game.js` na sobě teď závisí (skript sahá na
konkrétní prvky), takže prohlížeč, který servíruje novou stránku se starým
skriptem z cache, spadne v půlce vykreslování — stará `showResult` hledala už
smazaný `#failedWord`. Odkazy na `style.css`/`words.js`/`game.js` proto dostaly
`?v=3`; při další změně, která mění kontrakt mezi HTML a JS, se číslo zvýší.
(`sw.js` v tom nevinně — žádný `fetch` handler nemá, řeší jen push.)

→ No new memory entries.

## 2026-09-21

### Morfologický filtr: v seznamech zůstala jen podstatná jména
V poolu i v denní výzvě byla přídavná jména (`starý`, `denní`, `psí`,
`kuřecí`), tvary sloves (`měl`, `jedl`, `kopal`), zájmena (`naši`, `vaši`),
příslovce (`blízko`, `málo`) a vlastní jména (`milan`, `sara`). Doplněn krok
s MorphoDiTa (ÚFAL LINDAT REST API): projde jen slovo se jmenným čtením
v 1. pádě (nebo nesklonné), které pod vlastním lemmatem nemá čtení jako
přídavné jméno, zájmeno, číslovka, spojka, předložka, částice ani citoslovce.
Z původních 13 000 to vyřadilo 522 slov, pool se dorovnal na 15 000
z dalších kandidátů.

**Root cause / approach:** Kategorie Wikislovníku na tohle nestačí — heslo je
v Kategorii:Česká substantiva, i když je jmenný význam úplně okrajový, takže
křížová kontrola s kategoriemi jiných slovních druhů `starý` ani `měl`
nechytí. Dvě slepé uličky: „má jmenné čtení" je moc slabé (`psí` i `kuřecí`
jmenné čtení mají, čeština zpodstatňuje produktivně) a „má **jen** jmenné
čtení" je moc silné (vyhodí `stát`, `moc`, `peklo`, `brána`). Sedí až
kombinace: jmenné čtení v 1. pádě **a zároveň** žádné adjektivní/zájmenné
čtení pod vlastním lemmatem — slovesné a příslovečné homografy se nechávají,
protože `stát` a `ticho` podstatná jména jsou. Zbylých ~110 případů morfologie
rozhodnout neumí (`vedoucí` a `taneční` mají identické značky), ty jsou ručně
v `tools/pos_overrides.txt` s jasnou čárou: jména pro člověka podle role
a nesklonná přejatá ano, běžná přídavná jména ne.

Dva chytáky v datech: nesklonná substantiva (`madam`, `zoo`) mají v značce pád
`X`, ne `1` — první verze filtru je tiše vyhazovala. A tagger se musí volat
`input=vertical` s prázdným řádkem mezi slovy, jinak si ze seznamu udělá větu
a hádá z kontextu sousedů (`pes` → *peso*, `pravda` → částice).

→ *Memory saved: `czech_noun_filtering.md`*

## 2026-09-21

### Denní výzva: 2000 → 7300 slov (365 dní), slova určuje datum, pool 13k → 15k
Denní hra byla omezená na 2000 slov / 100 dní a slova se braly podle *postupu*
hráče, takže dva lidé ve stejný den hráli různá slova — „Top X % hráčů dneška"
tedy neporovnávalo nic. Teď je den odvozený z data (`dayIndex()`, `EPOCH`
2026-09-21, modulo 365), všichni mají v daný den stejných 20 slov, a den se
posune zítra bez ohledu na dnešní výsledek. Postupový model (`persist.level`,
„jedna chyba = den znovu") je pryč, nahradila ho `persist.results`
(index dne → skóre) a sbírka odehraných dní. Slovník: 7300 slov denní výzvy,
tréninkový pool doplněn na 15 000.

**Root cause / approach:** Slovník se nedal jen „natáhnout" — pořadí bylo čistě
podle OpenSubtitles, a to je korpus titulků: v prvních tisících sedí dabingový
slang a vokativy (`osle`, `lízo`, `ťopka`). Přeřadit to podle `wordfreq` `cs`
ale rozbije druhý konec — frekvenční korpusy počítají **tvary, ne lemmata**,
takže `měl` (tvar slovesa *mít*) vyskočí na 3. místo a `plzeň` na 145. Řešení
je průměr obou **pořadí**: slovo musí být běžné v mluveném i psaném jazyce.
Druhá věc: dny se nesmí řadit podle frekvence a pak rozbíjet tematické shluky
ručně (to se dělalo 2026-09-09 a při přegenerování se to celé ztratilo).
Slova jednoho tématu mají podobnou frekvenci, takže stačí rozdělit 7300 slov
do 20 frekvenčních pásem po 365 a dát každému dni právě jedno slovo z každého
pásma — stejné téma pak padne do stejného pásma a do jednoho dne se nedostane.
Z 365 dnů zbylo 6 kolizí (většinou stejný kmen), ty opraví prohození v pásmu.

Celý postup je nově skript `tools/build_words.py` + `tools/vetted_pool.txt`
(13 000 ručně prověřených substantiv — kurace, kterou z Wikislovníku
nezrekonstruuješ: `stát`/`moc`/`škoda` zůstávají, `měl` ne). Minule se pipeline
ztratila a musela se stavět znovu; teď je v repu a je deterministická.

→ *Memory saved: `czech_frequency_ranking.md`, `word_theme_clustering.md` (aktualizováno)*

## 2026-09-09

### Fixed same-day thematic word clustering in words.js
Pure-frequency ordering had grouped semantically related nouns into the same 20-word day (day 1: den/noc/večer/ráno all "time of day"; days 2–5: almost entirely family words). Wrote a one-off script defining 9 theme groups (čas dne, rodina, dny v týdnu, roční období, barvy, tělo, zbraně, emoce, domov/dům) and greedily swapped clustering words with nearby-day words of similar frequency rank until no day had 2+ words from the same theme.

**Root cause / approach:** Common nouns cluster by semantic field regardless of language, so a pure-frequency sort is guaranteed to produce same-theme runs among the most frequent words. Swaps cascaded through days 1–13 (family/time words are densest there) plus 7 isolated 2-word swaps elsewhere (days 9/10, 15–18, 24/25, 27/28, 33/34, 63/64, 72/73). Word count stayed 2000, no duplicates introduced.

→ *Memory saved: `word_theme_clustering.md`*

### Fast-forwarded main to latest branch, pushed to origin
Two remote branches (`claude/button-haptic-feedback-8kgxkn`, `claude/czech-word-game-f2hnia`) both pointed to the same latest commit `723fde7`, 30+ commits ahead of `main`. Fast-forward merged and pushed.

→ No new memory entries.
