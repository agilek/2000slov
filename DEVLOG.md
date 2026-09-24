# Devlog

## 2026-09-24

### Denní výzvu jde ukončit křížkem; sbírka slov přesunutá do profilu
Denní hra má vpravo nahoře stejný × jako trénink. Otevře sheet „Ukončit dnešní
výzvu?“ s počtem zbývajících slov; čas mezitím stojí. „Hrát dál“, klepnutí vedle,
tažení nebo Esc hru obnoví. „Ukončit výzvu“ zapíše zbývající slova jako
neuhodnutá (červená) a ukáže výsledek, den je pak hotový. Štítek
„Den X/365 · N slov“ se přesunul z úvodu do profilu (sekce Sbírka slov) a ikony
horní lišty mají o 4 px větší mezeru k popisku.

**Root cause / approach:** `closeSheet` teď volá `modal.onclose` jednou,
ať sheet zavře cokoli. Obnovu času stačí pověsit na to jedno místo; při
potvrzení ji přeskočí příznak `state.quitting`.

→ *Memory saved: `modals_are_bottom_sheets.md` (hook `onclose`)*

### Celé Kostky ve Slovka One — „špatné háčky" byly záložní Nunito
Google Fredoka, kterou Kostky používaly na tlačítka, kostky písmen, štítky
a popisky, **nemá ů č ď ě ň ř ť ani velké** — přesně ty, co chyběly i ve Fredoka
One. Prohlížeč je kreslil záložním Nunitem, takže uprostřed slov (Těžká,
Střední, ZMĚNIT PŘEZDÍVKU, kostka Ř) byl cizí znak. `--display` je teď Slovka
One a Google Fredoka se už nestahuje.

**Root cause / approach:** Nepoznáš to od oka ani z `getComputedStyle` (hlásí
jen deklarovaný stack) — až `CSS.getPlatformFontsForNode` přes CDP ukáže, kterým
písmem se znaky opravdu vykreslily („Fredoka ×4 + Nunito ×1" v „Těžká"). Po
změně scan 105 listových prvků ve Slovka One: žádný znak nespadne jinam.
`@font-face` má `font-weight: 100 900`, ať prohlížeč jediný řez neztučňuje;
jednotka „s" u času dědí písmo (globální `* { font-family: Nunito }` ji dřív
přepisoval).

→ *Memory updated: `slovka_font.md`*

### Slovka One: Fredoka One s doplněnými českými znaky na nadpisech
Fredoka One (2011) sedí hře nejvíc, ale chybělo jí 14 českých znaků
(ů č ď ě ň ř ť, Ů Č Ď Ě Ň Ř Ť). `tools/cz_font.py` je doplní a uloží kopii jako
**Slovka One**; hra ji má na nadpisech místo Capriole (`public/fonts/`, preload,
v shellu service workeru). Kopie OTF je i vedle originálu ve složce s fonty.

**Root cause / approach:** Hotové Š/š/Å jsou ve fontu slité obrysy, ne složeniny,
takže polohy znamének se musely *změřit* z kontur nad písmenem: háček stejný
tvar všude, velká o +200, vystředěný (+5); kroužek převzatý z å; ď/ť apostrof
×0,55 vpravo od dříku, u ť nad příčkou. Nové znaky jsou složeniny s převzatým
kerningem (Ť+o = T+o = −240), u ď/ť jen zprava. OFL vyhrazuje jméno „Fredoka",
proto jiné jméno; copyright autorky a text OFL jdou s fontem.

→ *Memory saved: `slovka_font.md`*

### Pauza s animovaným obrázkem
Nad „Pauza" jsou spící stopky v jazyce Kostek (`pauza-ziva.svg`): pohupují se,
symbol pauzy na ciferníku dýchá a stoupají písmena Z. Pod omezeným pohybem
statická verze `pauza.svg`.

**Root cause / approach:** Stejná technika jako živý plamen — SVG s CSS
animací uvnitř jako background-image, statická kopie pro reduced motion
z vnějšího CSS. Obě verze generuje jeden skript, ať se nerozjedou.

→ *Memory updated: `kostky_live_icons.md`*

### Nadpisy v Capriole, tlačítka zpět ve Fredoce
Pokus s Grandstanderem na tlačítkách je vrácený (revert). Problém s háčky byl
u nadpisů, ty jsou teď v Capriole: „20 slov", nadpisy obrazovek, sekcí
a sheetů, výsledek dne, hláška v mezihře, „Pauza", „Další kandidáti".

**Root cause / approach:** Capriola má jen řez 400 — s `font-synthesis: none`,
jinak by prohlížeč nadpisy uměle ztučnil (pozdější pravidla chtějí 700).
Pravidlo je na konci `kostky.css`, ať přebije dřívější Fredoku u týchž prvků.

→ *No new memory entries.*

### Detail slova s kandidáty, ikony akcí, lišta času nahoře ve hře
Klepnutí na kartu v mezihře otevře detail slova: štítky (pořadí podle častosti,
obtížnost, počet písmen, přesmyčky), nahoře zlatý „Nejlepší význam" s korunou,
pod ním „Další kandidáti" s hlasováním; po hlasu se pořadí přepočítá. Nahlášení
je vlaječka s potvrzením („Nahlásit?"), úprava tužka (i na stránce Moje
významy). Karta v mezihře má 3 řádky s výpustkou a odstín panelu, odkaz na
významy barvu panelu. Podržení Další slovo zastaví čas (puštění na tlačítku =
další, sjetí z něj = běží dál), pauza je klasický symbol. Nahoře ve hře je lišta
zbývajícího času, která plynule ubývá a barví se ze zelené do červené.

**Root cause / approach:** API nevracelo `voted`, takže po otevření vypadal hlas
jako nedaný a další klepnutí ho *odebralo* — `votedSet()` dotáhne hlasy
přihlášeného. U dotyku má prst implicitní pointer capture, takže `pointerup`
cílí vždy na tlačítko — „sjel z Další?" se proto ptá `elementFromPoint`. Lišta
času: `--t` (0–1) z `updateUI`, registrovaná přes `@property` s přechodem 1 s,
takže mezi vteřinami plyne; zelená → zlatá míchaná v HSL (v oklch vyšla kalná
oliva), zlatá → červená v oklch, prahy 18 s a 10 s.

→ *No new memory entries.*

### Moje významy: oblak štítků na profilu + stránkovaná obrazovka; % slovníku
Na profilu jsou vlastní významy jako oblak štítků (slovo + palce, 12 nejlépe
hodnocených) s odkazem na novou obrazovku **Moje významy**: karty jako dřív,
10 na stránku, úprava, označení skrytých po nahlášení. `/api/defs/mine` umí
`limit`/`offset`/`sort=votes` a vrací `total`. Dlaždice tréninku ukazuje různá
uhodnutá slova a „to je X % slovníku". Odhlášení je těsně nad Smazat účet.

**Root cause / approach:** Procento slovníku jde poctivě jen z různých slov —
`practiceWords` sčítá i opakování (mohlo by přes 100 %). Nové `practiceSeen` je
bitmapa nad PRACTICE_WORDS v base64 (~2,5 kB); počítá se až od teď, starší
tréninky neznáme. Pod 1 % dvě desetinná místa, jinak by první slova ukázala
„0 %". `editDef` dostal callback po uložení — dřív natvrdo překresloval mezihru.

→ *No new memory entries.*

### Podržení pauzne mezihru, kolečko myši na profilu, Smazat účet dole
Podržení prstu kdekoli na panelu mezihry (mimo tlačítka) odpočet na chvíli
zastaví — vyplňování tlačítka stojí a ukáže se pauza; puštěním běží dál. Krátké
klepnutí funguje jako dřív (mimo kartu = další slovo). Profil a výsledek jdou
zase scrollovat kolečkem myši. „Smazat účet" je červené tlačítko na konci profilu.

**Root cause / approach:** Scroll: pravidla `html:has(#profile.active),
body:has(#profile.active) { overflow-y: auto }` dělala z body scroll kontejner,
který sám scrollovat nemůže, a spolu s `overscroll-behavior: none` kolečko ani
tah nepustil dál k viewportu — programový `scrollTo` přitom fungoval, proto to
nebylo vidět. Scrolluje teď jen html, body má `overflow: visible`. Podržení:
po puštění se click nepočítá (prohlížeč ho po dlouhém stisku klidně pošle)
a text významu v mezihře nejde označit, jinak by podržení vybíralo text.

→ *Memory updated: `ios_native_feel_gotchas.md`*

### Vývojové prostředí pro účty a významy: DEV=1, seed, přihlášení bez e-mailu
Účty a komunitní významy jdou konečně vyzkoušet lokálně. `DEV=1` v `.dev.vars`
zapne přihlášení bez Resendu (kód a odkaz se vypíšou do terminálu wrangleru),
cookie bez `Secure` (jde i z telefonu přes http), vypne edge cache významů a
přidá `GET /api/dev/login?kdo=Tester`. `node worker/seed-dev.mjs` založí účty
Tester + 5 autorů, ~870 významů (48 ručně psaných, zbytek ukázkový pro ~70 %
Lehké) a hlasy; jde pouštět opakovaně. Karta v mezihře se po hlasu ze sheetu
nově přepočítá.

**Root cause / approach:** Bez secretů vracel `/api/me` `auth:false` a psaní
významů bylo nedosažitelné i lokálně — proto „význam není vidět". Tři tiché
pasti: `Secure` cookie se přes `http://192.168…` z telefonu neuloží; edge cache
drží i „slovo nemá význam" 5 minut, takže by čerstvý seed nebyl vidět; a stará
lokální D1 má `definitions.client_id NOT NULL`, protože `CREATE TABLE IF NOT
EXISTS` existující tabulku nezmění (seed píše `'dev-seed'`). Dev přihlášení je
za stráží `DEV=1` + lokální adresa + jen účty `dev-…` a hlídá ho `test.mjs`.

→ *Memory saved: `dev_accounts_and_seed.md`*

### Mezihra: víc hlášek, bez času, výzva k doplnění významu
Hlášky po uhodnutí mají tři zásobníky po 6–8 (do 5 s, zbývalo ≤ 10 s, běžně),
nikdy stejná dvakrát po sobě a všechny ≤ 12 znaků kvůli štítku série. Čas pod
hláškou zmizel — dobu do dalšího slova ukazuje tlačítko. Když slovo nemá význam,
je místo karty výzva „Víš, co znamená „…“?" s tužkou, která otevře sheet významů.

**Root cause / approach:** Význam nebyl vidět vůbec, protože jsem „Přidat
význam" schovával, když neběží účty (v produkci pořád chybí secrety,
OTEVRENE 1.1), a lokální statický server nemá API. Výzva je teď vždy; co se
stane po klepnutí, řeší sheet významů.

→ *No new memory entries.*

### Mezihra v tréninku jako panel zdola, živý plamen
Mezihra po slově byla všude stejná (text uprostřed, „Další slovo za 5 s"),
nešlo z ní přejít dál ani odejít a klepnutí ji *pozastavilo*. Teď vyjede panel
zdola jako Duolingo po odpovědi: zelený/červený, odznak ✓/✗, slovo jako kostky
(uhodnuté poskočí, nestihnuté se přeskládají z rozsypaného pořadí), série
„🔥 N v řadě" s plamenem, který plápolá a na milnících vzplane s jiskrami.
Tlačítko Další slovo se vyplňuje (3 s / 6 s po chybě), klepnutí mimo kartu
nebo Enter jde hned, sáhnutí na význam odpočet zruší, křížek funguje i tady.
„Přidat význam" se bez účtů neukáže (vedlo do slepé uličky). Živý plamen je
i v profilu (šedý při nulové sérii) a v pobídce k sérii.

**Root cause / approach:** Plamen je jedno SVG s CSS animací uvnitř
(`plamen-zivy.svg`) — jako background-image plápolá v Chromu i WebKitu, pod
omezeným pohybem ho Kostky vymění za statický. Přeskládání kostek je FLIP bez
měření: kostky jsou v jedné řadě, takže posun = rozdíl indexů × (šířka + mezera)
do `--from`, oblouček `--hop`, animace v keyframes s `var()`. Panel „Paráda!"
ze hry je v tréninku schovaný (`#game.practice`), jinak by vyjely dva.
Sjetí dolů sdílí se sheety `slideDown()`.

→ *Memory saved: `kostky_live_icons.md`*

### Sheety: čisté záhlaví a zavírání vždy animací
Ze sheetů zmizel křížek i dělicí čára; zůstal úchyt a nadpis, který nese
informaci — v tréninku rovnou otázka „Jak těžká slova chceš?", ve zpětné vazbě
„Jak se ti hraje?" (dřív opakovaly tlačítko, kterým se sheet otevřel). Zavírá
se klepnutím do pozadí, tažením dolů, Escapem nebo tlačítkem v obsahu —
a vždy animací: sheet sjede dolů z místa, kde právě je, pozadí se rozplyne.
Místo čáry pod nadpisem měkký přechod, pod který seznam zajíždí.

**Root cause / approach:** Dřív `closeModal()` jen sundal `.active`, takže sheet
zmizel naráz. `closeSheet()` vezme aktuální `transform` (i z půlky tahu nebo
otevírací animace), dotáhne ho na `translateY(100%)` a sheet schová až po
300 ms. Konec hlídá časovač, ne `transitionend` — ten probublává z přechodů
uvnitř sheetu (karty, položky sbírky) a zavřel by ho předčasně. Fokus jde na
`.modal-content` (`role=dialog`), ne na skryté „Zavřít" — programový fokus
tlačítka ho rozsvítil i po klepnutí prstem.

→ *Memory updated: `modals_are_bottom_sheets.md`*

### Lehká obtížnost jen do 5 písmen
Lehká bere z 3000 nejběžnějších slov jen ta do 5 písmen (1215 slov, třeba
*hotel, nákup, beton*). Střední a Těžká beze změny.

**Root cause / approach:** Lehká byla pořád těžká kvůli délce, ne frekvenci:
mezi 3000 nejčastějšími má 60 % slov 6+ písmen (*inteligence, trojúhelník*)
a obtížnost přesmyčky roste s délkou faktoriálně (5 písmen = 120 pořadí,
7 = 5040). Úroveň má proto volitelné `maxLetters` vedle `size`.

→ *No new memory entries.*

### Modály jsou sheet zdola i na desktopu
Z `style.css` i `designs/kostky.css` zmizela desktopová varianta
(`@media (min-width: 600px) and (hover: hover)`), která z sheetu dělala dialog
na střed. Teď je jediný vzor: sheet přilepený dole s úchytem, na širokém
displeji jen užší (460 px); Kostky mu daly okraj i po stranách.

**Root cause / approach:** Uživatel chce sheet jako stabilní vzor napříč
zařízeními. Tažení dolů funguje i myší — `sheetDrag` v `game.js` je na pointer
eventech, takže desktop nepotřeboval nic navíc.

→ *Memory saved: `modals_are_bottom_sheets.md`*

### Obtížnost tréninku: Lehká / Střední / Těžká
Trénink teď před startem nabídne tři úrovně (sheet po klepnutí na Trénink
na úvodu i ve výsledku): Lehká = 3000 nejčastějších slov, Střední = 7300
(přesně slova denní výzvy, výchozí), Těžká = všech 15 000. Klepnutí na úroveň
trénink rovnou spustí, volba se pamatuje v `persist.practiceLevel` a je vidět
v liště („Slovo 5 · Lehká"). V Kostkách karty s retem a ikonou síly 1–3 sloupků.

**Root cause / approach:** Trénink míchal celý pool, a protože je seřazený podle
frekvence, polovina slov chodila z řídkého konce (7300–15 000: *douglaska,
větrolam*), navíc delších (průměr 7,7 písmene proti 5,9 u prvního tisíce).
Úroveň je proto jen `PRACTICE_WORDS.slice(0, N)`. Popisek „Střední = jako denní
výzva" hlídá nový test (denní výzva = přesně prvních 7300 slov poolu).

→ *No new memory entries.*

### Ikona aplikace v jazyce Kostek
Nová ikona na plochu: zelené pole, mřížka 2×2 jako sdílený výsledek, tři bílé
klávesy s šedým retem a jedno propadlé pole — otisk použitého písmene. Navazuje
na starou ikonu (stejná mřížka, prázdné pole vlevo dole), jen v barvách a tvarech
Kostek. Zdroj je `public/icons/icon.svg`, PNG (512, 192, 180, 32) jsou z něj
přes `rsvg-convert`.

**Root cause / approach:** Písmena na ikoně (např. SLOV) by ve 32px faviconu
splynula a bez fontTools nešla převést z Fredoky do křivek, proto motiv bez
textu. PNG bez alfa kanálu — iOS průhlednost v apple-touch-icon vyplní černou.
Už nainstalované PWA si ikonu nechají, dokud ji hráč nepřidá na plochu znovu.

→ *No new memory entries.*

### Větev kostky-trenink: Kostky jako jediný vzhled
Z průzkumu šesti směrů zůstaly Kostky. `designs/kostky.css` se načítá natrvalo
za `style.css`; ostatních pět směrů, nástěnka `/designs.html` a přepínací
skript `?design=` jsou pryč (zůstávají na `design/genz-directions`). Fredoka
se stahuje v hlavním odkazu na Google Fonts místo `@import` (bez řetězení),
service worker má Kostky v shellu (`slov2000-v4`), `theme-color` a manifest
mají barvy Kostek. Z `game.js` zmizel hák `--t`, Kostky ho nepoužívají.

**Root cause / approach:** Kostky zůstaly vrstvou nad `style.css`, ne sloučené
do něj — sloučení by byl velký přepis bez viditelného rozdílu a změny
v tréninku se dají dělat hned.

→ *Memory updated: `design_directions_board.md`*

### Kostky: vlastní ikony místo systémových emoji
Čtrnáct SVG v `public/designs/kostky/` ve stylu směru (ploché barvy z palety,
spodní ret, světlý pruh, žádné obrysy): statistiky v profilu, trofej / koruna /
medaile / zlomené srdce u umístění, palec u hlasů, zámky ve sbírce a u
odkrytých slov, plamen v pobídce k sérii, zvonek, telefon „na plochu"
a odškrtnutí po odeslání zpětné vazby. Ostatní směry ukazují emoji jako dřív.

**Root cause / approach:** Emoji, která píše JS do textu, CSS nepřebije.
`setEmojiText()` v `game.js` je proto obalí do `<span class="emoji"
data-emoji="…">` (staví DOM, ne HTML — percentil může přijít z backendu)
a kůže znak odsune `text-indent`em mimo box a ukáže ikonu. `color:
transparent` barevné emoji neschová. Text do sdílení zůstává emoji.

→ *No new memory entries.*

### Šest vizuálních směrů pro Gen Z (větev design/genz-directions)
Průzkum vzhledu bez změny funkcí: šest vrstev CSS v `public/designs/` nad
`style.css`, zapínaných `?design=<název>` (pamatuje se, `?design=off` vypne).
Tři vlastní (Kostky/Duolingo, Sešit, Záře) a tři podle identit aplikací
(Plakát/Spotify Wrapped, Cvak/Snapchat, Smyčka/TikTok). `/designs.html` je
ukazuje živě vedle sebe a přepíná všechny do stejného stavu i režimu. Do
`game.js` přibyly jen dva prezentační háky: `--t` (zbývající čas 0–1) na
`#game` a barvy konfet z `--confetti`. Který směr, čeká v OTEVRENE-OTAZKY 1.6.

**Root cause / approach:** Nástěnka řídí iframy přes `contentWindow.eval`, který
vidí i `let`/`const` globály hry (`state`, `persist`, `defCache`); `savePersist`
je deklarace funkce, takže jde v rámečku přepsat na no-op a ukázková data
nepřepíšou uloženou hru. Chrome dává iframu `prefers-color-scheme` podle
`color-scheme` rámečku — přepínač režimu tak nesahá do hry. Past pro každou
kůži: `.answer-slot` si nechává `entering` i inline `animation-delay` napořád,
keyframe na `.filled` pak dědí zpoždění i×40 ms.

→ *Memory saved: `design_directions_board.md`, `webkit_check.md`*

## 2026-09-21

### Revize očima iOS designéra: bezpečné zóny, sheety, palcová zóna
Prošel jsem aplikaci jako nativní iOS appku a opravil, co ji prozrazovalo jako
web. Modály jsou teď sheety zdola s úchytem, přilepenou hlavičkou a zavíráním
stažením dolů; písmena ve hře sedí v palcové zóně, HUD (mřížka + čas) zůstal
nahoře; `:hover` platí jen tam, kde je myš.

**Root cause / approach:** `viewport-fit=cover` chybělo v meta viewportu, takže
**všech ~10 `env(safe-area-inset-*)` v CSS vracelo 0** — celá práce s bezpečnými
zónami byla mrtvá a nebylo to nijak vidět, protože 0 je validní hodnota.
Druhá tichá chyba: `.screen p:not(.welcome-instruction)` (0,2,1) přebíjelo
`.profile-note` (0,1,0), takže poznámky v profilu jely 20 px na střed místo
13 px vlevo. A komentář v `sw.js` tvrdil, že fonty jsou `opaque` — Google Fonts
chodí s CORS hlavičkami (`type === 'cors'`), takže cachovat jdou; bez toho
appka offline naskočila v systémovém fontu.

→ *Memory saved: `ios_native_feel_gotchas.md`*


### Denní slova zamíchaná ve words.js — zítřek už ze zdrojáku nevyčteš
`words.js` posílal všech 7300 slov v pořadí dnů, takže si kdokoli přečetl
zítřek. Nově se do souboru zapisuje 365 blobů (`PACKED`), jeden na den,
a `unpackDay(den)` je rozbalí až na vyžádání. Offline hra zůstala beze změny —
slova jsou pořád v balíčku, jen nečitelná.

**Root cause / approach:** Tajemství není slovník, ale **mapování den → slova**;
`PRACTICE_WORDS` (15 000, nadmnožina) je veřejný tak jako tak. Šifra je
synchronní (mulberry32 + XOR), ne WebCrypto — klíč stejně leží v balíčku, takže
by se za sílu AES zaplatilo jen tím, že `dayWords()` bude `async` a nakazí
volající. Vědomý strop: `for (i…) dayWords(i)` pořád vypíše rok; skutečné
utajení = servírovat den z workeru, čímž padá offline. Šifra běží ve dvou
jazycích (Python packuje, JS rozbaluje) a parita bitů se hlídá tím, že
existující testy slovníku běží nad rozbalenými daty — rozjetý bit je shodí hned.

→ *Memory saved: `packed_daily_words.md`*

### Významy jen pro přihlášené, úprava pro autora, pobídka na sérii
Psát, hlasovat, nahlašovat i upravovat významy smí nově jen přihlášený hráč.
Číst je může kdokoli. Autor smí svůj význam upravit — když už má hlasy, úprava
je smaže. Na výsledkové obrazovce se při sérii 3/7/14/30/60/100/200/365 dní
jednou ozveme, že série žije jen v tomhle zařízení.

**Root cause / approach:** Anonymní autorství byla tikající bomba. Přezdívka
nebyla nijak ověřená ani rezervovaná, a přitom se tiskla k publikovaným
významům — dva lidé mohli psát jako „Michal" a po zavedení účtů by nešlo určit,
kdo je kdo (nebo by se skutečná Kačka po registraci ocitla vedle cizího obsahu).
Zrušením anonymního zápisu ten problém mizí celý: jméno u významu je vždy
přezdívka z účtu. Zároveň to spravilo hlasování — dosud šlo hlasy sypat
libovolným počtem vymyšlených `clientId`, protože identita byla self-asserted.
Identitou je teď účet, takže se unikátní index posunul z `(client_id, word)`
na `(user_id, word)` — na jednom telefonu tak můžou psát dva lidé.

Úprava vynuluje hlasy, pokud nějaké byly. Bez toho by šlo vyhlasovat neškodnou
větu a pak ji přepsat na cokoli — a hlasy by se zdědily.

Pobídka k účtu sedí na sérii, ne v nastavení: je to jediná věc, o kterou tu jde
reálně přijít, a lidi si sérii chrání. Ukáže se jednou na milník (`nudgedAt`)
a jen když jsou účty vůbec spuštěné, jinak by to byla slepá ulička.

**Důsledek, se kterým je třeba počítat:** dokud nebude doména a Resend, nejde
přidat význam vůbec. Je to přímý důsledek rozhodnutí, ne regrese.

→ No new memory entries.

## 2026-09-21

### Účty připravené „na klíč" — spí, dokud nepřijdou secrety
Celé přihlášení magic linkem je hotové a nasazené, ale **neaktivní**: bez
`RESEND_KEY`/`MAIL_FROM` vrací `/api/me` `auth:false`, `/api/auth/start` končí
na 503 a aplikace sekci účtu vůbec nevykreslí. Zapnutí = doména + ověření
v Resendu + tři secrety, v kódu se nemění nic.

**Root cause / approach:** Odkaz session **nevytváří**, jen ji schválí — vyzvedne
si ji poll té instance, která o přihlášení požádala. Důvod: odkaz z Mailu otevře
Safari/Chrome, ne nainstalovanou PWA, a ta má na iOS 17.4+ vlastní úložiště
cookies oddělené od Safari, takže cookie z mailu se do aplikace nedostane nikdy.
Schválení je navíc `POST` za tlačítkem: poštovní skenery odkazy předběžně
stahují a `GET` by tiše přihlásil cizího člověka (ověřeno — pouhý GET na odkaz
nechá žádost ve stavu `pending`). Jako druhá cesta je v mailu šestimístný kód
pro případ, že se hráč vrátí do aplikace dřív, než doklikal.
E-mail se neukládá, v DB je jen `sha256(adresa + HASH_PEPPER)`.

Tři věci, které se ukázaly až při zkoušení:
- **`.dev.vars` se od přesunu konfigurace do kořene repa vůbec nenačítal.**
  Wrangler ho hledá vedle `wrangler.toml`, ne u zdrojáků, takže lokálnímu vývoji
  tiše zmizel i VAPID klíč. Soubor je teď v kořeni — a **nejdřív** přibyl do
  `.gitignore`, protože tam pro něj dosud žádné pravidlo nebylo.
- **Export konstant ze vstupního modulu workeru shodí runtime.** Cloudflare
  kontroluje každý pojmenovaný export jako handler (`not of type 'function or
  ExportedHandler'`), takže validace bydlí v `validate.js` a přihlášení v
  `auth.js`.
- **Vypnuté přihlášení musí být vypnuté doopravdy.** Zbylá `sid` cookie dál
  identifikovala hráče, i když byl zbytek účtu skrytý — zůstal „přihlášený" bez
  jakéhokoli ovládání. `currentUser()` teď při vypnutém auth vrací `null`.

Ověřeno proti běžícímu workeru s mockem pošty: start → odkaz i kód v mailu →
GET nic neschválí → POST schválí → poll vydá session v `HttpOnly` cookie →
druhý poll už je `expired` → přezdívka → význam se podepíše účtem (podvržený
`author` z těla requestu se ignoruje) → anonymní významy ze zařízení se při
přihlášení navážou na účet → odhlášení → smazání účtu významy zachová a jen
z nich sundá jméno.

→ No new memory entries.

## 2026-09-21

### Přesmyčky jen pro trénink + doplacení vlastních dluhů
Přesmyčky se nově uznávají **jen v tréninku** — denní výzva je soutěž, všichni
v ní mají stejných 20 slov, takže musí padnout přesně to hledané
(`isAcceptedWord()` končí na `state.mode !== 'practice'`). K tomu tři věci,
které jsem dlužil: spustitelná kontrola, edge cache na významy a konec
mrtvého tlačítka „Přihlásit se".

**Root cause / approach — a jedna chyba, která málem šla do produkce:**
Pro `test.mjs` jsem nejdřív přidal `export { clean, defTextError, DEF_MAX… }`
přímo do `worker/src/index.js`. Cloudflare ale kontroluje **každý pojmenovaný
export vstupního modulu** jako handler, takže runtime odmítl nastartovat:
*„Incorrect type for map entry 'DEF_MAX': the provided value is not of type
'function or ExportedHandler'"*. Chytil to až `wrangler dev` — deploy by spadl.
Validace se proto přestěhovala do `worker/src/validate.js`, odkud ji importuje
worker i test.

- **`node test.mjs`** — 18 kontrol, bez frameworku: validace významů (hranice
  délky, sprostá slova, odkazy, řídicí znaky), vlastnosti slovníku (počty,
  podmnožina, jedno slovo z každého pásma na den) a úplnost přesmyček.
  Ověřeno mutací: když se z `ALTS` odebere vazba `síla→lísa`, test spadne
  s exit 1 a vypíše, která vazba chybí.
  Pozor na past: `words.js` se spouští ve `vm`, takže pole z něj mají prototyp
  z jiného realmu a `deepStrictEqual` je odmítne — porovnává se proto obsah.
- **Edge cache významů** po jednotlivých slovech (ne po dávce — fronty jsou
  u každého hráče jiné). Klíč se staví ručně, nikdy z příchozího requestu:
  ten nese cookie a `clientId` a cache by se roztříštila. Příznak `mine` je
  na hráče, takže se dopočítává až po cache — ověřeno, že autor vidí `true`
  a cizí `false` i při zásahu z cache. Zápis slovo zneplatní.
- **Přezdívka má konečně kde bydlet.** Profil ji umí nastavit a změnit,
  promítne se do avataru i do formuláře u významů. `promptLogin()`, které jen
  ukázalo toast, je pryč.

→ No new memory entries.

## 2026-09-21

### Přesmyčky: hra uzná každé slovo, které sama zná
Když šlo ze stejných písmen složit jiné slovo z poolu, hra ho přesto označila
za chybu — `síla` nepřijala `lísa`, `vlas` nepřijal `sval`, `orkán` nepřijal
`nárok` ani `korán`. Generátor teď k ručně kurátorované mapě `ALTS` dopočítá
**přesmyčky uvnitř poolu**: 325 skupin, 677 slov, doplněno 132 chybějících
vazeb (34 z nich v denní výzvě). `ALTS` má 1348 klíčů místo 1234.

**Root cause / approach:** Chyběly, protože původní mapa vznikla nad starým
13 000slovním poolem a nikdy se nepřepočítala po tom, co se pool přefiltroval
na podstatná jména a doplnil na 15 000. Nešlo ji ale přegenerovat celou — nese
kuraci proti nějakému českému slovníku, kterou se nepodařilo zrekonstruovat
(uznává i tvary mimo pool, `otec` → `ocet`, `otce`; `efka` ano, `fake` ne).
Řešení je proto přírůstkové: ruční část se přebírá beze změny a jen se k ní
přidají vzájemné vazby uvnitř každé skupiny slov se stejnými písmeny.

Ověřeno, že `WORDS` ani `PRACTICE_WORDS` se nezměnily — rozdělení slov do dnů
tedy zůstalo stejné a hráčům se den nepřeskládal. Změnilo se jen `ALTS`.

→ No new memory entries.

## 2026-09-21

### Komunitní významy slov + mezihra po každém slově v tréninku
Trénink má po **každém** slově (uhodnutém i nestihnutém) stejnou mezihru: velké
slovo, nejlépe hodnocený význam od hráčů, odpočet na další slovo a tlačítko
k přidání vlastního. Klepnutím kamkoli se odpočet zastaví a zase rozjede, bez
tlačítka. Modal se všemi významy umí hlasovat, nahlásit a přidat vlastní; po
třech nahlášeních význam zmizí. Ve statistikách přibyla uhodnutá slova
z tréninku — opakované slovo se počítá znovu.

**Root cause / approach:** Zápisy měly podle plánu viset na účtech, jenže
přihlášení e-mailem je zablokované na doméně, která zatím není koupená
(Resend bez ověřené domény nedoručí). Autorství proto zatím drží anonymní
`client_id` — stejné, jaké používá `results` — a přezdívka je jen self-asserted
řetězec. Plán s tím počítá: `users.client_id` je právě na pozdější navázání účtu.
Brzdy proti zahlcení jdou i bez přihlášení: unikátní index `(client_id, word)`
= jeden význam na slovo a hráče, 20 významů/den, délka 10–200, regex na sprostá
slova přenesený z `tools/build_words.py`, zákaz odkazů a zákaz hlasovat si sám.

Dvě věci, které to formovaly:
- **Mezihra je překryv, ne `.screen`.** `.screen` je `100dvh` s `touch-action:none`
  a `showScreen()` by deaktivoval `#game`, do kterého `placeGameGrid()` fyzicky
  vkládá herní mřížku. Odpočet jede v `state.nextTimer`, který `startPracticeGame()`
  i `exitPractice()` už uklízejí, takže nevznikl další kill switch.
  Tím zanikl `countdownToNextWord()` a přepisování `#progress` — smazáno.
- **Cizí text jen přes `textContent`.** `game.js` na pár místech sype `innerHTML`
  a od téhle chvíle se v DOMu ocitá text od cizích lidí u každého slova. Ověřeno:
  význam s `<script>` i přezdívka s `<img onerror=...>` se vykreslí jako text,
  žádný uzel nevznikne.

Pozn.: schválený plán psal, že otevření seznamu významů má session **zabít** —
to si odporovalo s dřívějším rozhodnutím „pozastavit a pokračovat". Platí volba
uživatele: modal odpočet jen pozastaví, po zavření (i Escapem) jede dál.

→ No new memory entries.

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
