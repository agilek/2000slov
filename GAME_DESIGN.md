# 20 slov — Game Design

> **365 dní. 7300 podstatných jmen. 30 sekund na slovo. Každý den hrají všichni to samé.**

Věrná česká adaptace hry [18words.com](https://18words.com/) — stejný vizuál
(světlé pozadí, fonty Baloo 2 + Nunito, kulaté dlaždice, pilulková tlačítka),
stejný herní pocit, ale s vlastním rokem **7300 českých podstatných jmen**.
Trénink navíc čerpá z podkladového poolu **15 000 slov**, bez omezení na datum;
hráč si volí, jak velkou část (obtížnost).

## 1. Základní smyčka

- **Denní výzva** má **7300 českých podstatných jmen** (Wikislovník, Kategorie:Česká
  substantiva) rozdělených do **365 dní** po 20 slovech. Jde o 7300 nejběžnějších
  slov širšího poolu 15 000 slov — trénink čerpá z jeho výřezu podle obtížnosti (viz níže).
- **Den určuje datum, ne postup hráče.** Index dne = počet dní od `EPOCH`
  (21. 9. 2026) modulo 365. Všichni hráči tak mají v daný kalendářní den
  stejných 20 slov a výsledky jsou porovnatelné (to je celý smysl „Top X %
  hráčů dneška"). Po roce se cyklus opakuje.
- **Obtížnost je mezi dny vyrovnaná**, ne rostoucí: 7300 slov je rozděleno do
  20 frekvenčních pásem po 365 slovech a každý den dostane náhodně (napevno,
  seed 20260921) právě jedno slovo z každého pásma. Každý den tak má stejný mix
  běžných a vzácných slov. Délka slova nehraje roli.
- Každé slovo se zobrazí jako **kruhové dlaždice s přeházenými písmeny**.
  Hráč má **30 sekund** složit slovo klepáním na písmena (nebo psaním na klávesnici).
- Po vybrání všech písmen se slovo **vyhodnotí automaticky** (žádné tlačítko Potvrdit):
  - správně → zelený puls, další slovo (časovač se animovaně dotočí zpět na 30 s),
  - špatně → červené zatřesení, výběr se vrátí, **časovač běží dál** — zkoušíš znovu,
  - vyprší čas → hledané slovo se červeně odhalí, políčko v mřížce zčervená a **hraje se dál**.
- Hraje se vždy **všech 20 slov**. Mřížka 4×5 nahoře se plní zeleně/červeně.
- **Série = odehrané dny v kuse.** Každý dohraný den ji prodlouží, na skóre
  nezáleží. Přetrhne ji jen vynechaný den (jako Duolingo). Stejně ji počítá
  server (`stats().serie`) i úspěchy. Do 2026-09-24 se počítaly jen dny 20/20,
  starý stav se jednou přepočítá z `results` (`migrateStreak`).
- **Všech 20 zelených** = perfektní den (koruna, zlatá karta, konfety).
  Perfektní dny po sobě nese úspěch Hattrick.
- Den se neopakuje — zítra přijde další datum a s ním nových 20 slov.
  Nedohraný den se už nevrátí (až za rok).
- Odehraný den (ať dopadl jakkoli) se odkryje do sbírky.
- **Jeden pokus denně**, nové kolo o půlnoci. Rozehraný den přežije reload
  (stav se ukládá každou sekundu), opuštěný nedohraný den se druhý den zahodí.

### Uznávání přesmyček

Jako správná odpověď se uznává i **jiné platné české slovo ze stejných písmen**
(rok/okr, zem/mez…). Mapa alternativ je předpočítaná (`ALTS` ve `words.js`)
z herního slovníku + frekvenčního seznamu validovaného hunspellem — 1234 hesel má alternativu.

### Proč to funguje psychologicky

| Prvek | Efekt |
|---|---|
| 30s časovač | Napětí v každém slově, chybný pokus pálí čas |
| Jeden pokus denně | Vzácnost → rituál, důvod se vracet |
| Dohrání všech 20 | I prohraný den dá kompletní, sdílitelnou mřížku |
| Stejná slova pro všechny | Výsledky jdou porovnávat — bez toho je „Top X % dneška" jen ozdoba |
| Zmeškaný den se nevrací | Vzácnost dne → důvod nevynechat (FOMO, jako Wordle) |
| Odkrývání 7300 slov | Sběratelský progres a roční závazek (365 dní hraní) |
| Vyrovnaná obtížnost dnů | Žádný hráč nedostane systematicky těžší rok než jiný |

## 2. Obrazovky (zrcadlí originál)

1. **Welcome** — šedá mřížka 4×5 (po odehrání barevná), nadpis, instrukce,
   klikací řádek „DEN 12/365 · 220/7300 SLOV" (otevře sbírku), zelené tlačítko Hrát.
2. **Hra** — mřížka, „SLOVO 3/20", velký časovač, rámečky pro odpověď, kruhová písmena.
   Klik na rámečky zruší výběr, Shift zamíchá písmena (FLIP animace, 1× na slovo).
3. **Pauza** — celoobrazovkově při přepnutí okna/tabu; jen Pokračovat (žádný restart —
   restart by obcházel pravidlo jednoho pokusu).
4. **Výsledek** — mřížka se přesune nahoru, postupné odkrývání řádků:
   „Máš všech 20 slov!" / „Máš 17 z 20 slov!", trofejová řádka, věta o zítřejším dni,
   Sdílet skóre (zelená) + Vyzvat kamaráda (modrá), odpočet do půlnoci,
   „Přidat na plochu“ (Safari na iPhonu/iPadu mimo plochu: tlačítko rozbalí
   postup; Chrome: nativní instalace přes `beforeinstallprompt`, po instalaci
   zmizí samo; křížek nabídku skryje natrvalo),
   Sbírka slov + Trénink, řádek se zpětnou vazbou. Perfektní den = konfety.
5. **Denní výzva** (dřív „Sbírka slov“; sheet ve stylu archivu originálu) — cílem je nasbírat
   všech 365 dní, nahoře „N z 365 dní“ s pruhem. Dny podle data bez roku
   (ne „Den N“): co hráč propásne, vrátí se až za rok. Odehrané se rozbalí
   na 20 slov a ukážou skóre, aktuální „dnes", zbytek zamčený.
   Významy slov: **číst je může kdokoli, psát a hlasovat jen přihlášený**.
   Anonymní autor neexistuje — u významu vždy stojí přezdívka z účtu, takže
   si ji nikdo nemůže přivlastnit. Autor smí svůj význam upravit; když už má
   hlasy, úprava je smaže (jinak by šlo vyhlasovat neškodnou větu a přepsat ji).

6. **Trénink** — nekonečná volná hra z poolu 15 000 slov, bez ohledu na datum.
   Před startem si hráč vybere **obtížnost** = kolik nejčastějších slov se hraje:
   **Lehká** z 3000 nejběžnějších jen slova do 5 písmen (1215 — délka rozhoduje
   u přesmyčky víc než frekvence), **Střední** 7300 (přesně slova denní výzvy, výchozí), **Těžká**
   všech 15 000 včetně vzácných (dřív jediná možnost — polovina slov pak byla
   z řídkého konce poolu, třeba *douglaska*). Volba se pamatuje (`practiceLevel`)
   a je vidět v liště („Slovo 5 · Lehká"). **Nemá výsledkovou obrazovku** —
   po každém slově vyjede zdola **panel mezihry** (jako Duolingo po odpovědi):
   zelený po uhodnutí („Paráda!", „Tak tak!", „Bleskovka!" + čas), červený po
   vypršení (kostky slova naskočí rozsypané a přeskládají se), série „🔥 N v řadě"
   s oslavou na milnících 5/10/20/30/50/100, význam slova a tlačítko **Další
   slovo**, které se vyplňuje, dokud další slovo nenaběhne samo (3 s po uhodnutí,
   6 s po chybě). Klepnutí kamkoli mimo kartu nebo Enter = hned další; sáhnutí na
   význam odpočet zruší. Trénink se ukončí křížkem vpravo nahoře (i z mezihry).
   Bez vlivu na denní výzvu.

### Navigace a přechody

Jako v mobilních appkách, ať hráč ví, kde je a jak se tam dostal
(`showScreen` + `navAnimate` v game.js, zásobník `navStack`):

- **Hlouběji** (domov → Profil → Úspěchy / Moje významy / Upravit profil /
  Veřejný profil): nová obrazovka přijede zprava přes starou, ta ustoupí
  o 30 % doleva a ztmavne.
- **Zpět** (šipka, uložení profilu): obrazovka odjede doprava, předchozí se
  vrátí zleva i se scrollem, kde hráč byl.
- **Hra** (Hrát, Trénink) je vrstva přes aplikaci: zvětší se z 94 % a vynoří,
  při konci se zmenší a rozplyne. Z mezihry na profil autora a zpět je
  hlouběji/zpět.
- **Domov** je úvod i výsledek (jeden klíč v zásobníku). Sheety vyjíždějí
  zdola. `prefers-reduced-motion` přechody vypne.

## 3. Trofeje a sdílení

Trofejová hláška je (stejně jako v originále) **statická tabulka** — žádný backend:

| Skóre | Hláška |
|---|---|
| 20 | Top 1 % hráčů dneška 👑 |
| 19 | Top 2 % hráčů dneška 🏆 |
| 18 | Top 3 % hráčů dneška 🏆 |
| 17 | Top 5 % hráčů dneška 🏆 |
| 15–16 | Top 10 % hráčů dneška 🏅 |
| 13–14 | Top 20 % hráčů dneška 🏅 |
| 9–12 | Top 50 % hráčů dneška 🏅 |
| 0–8 | Dnes bez trofeje 💔 |

Sdílí se **obrázek**: svislá karta 1080×1920 (formát příběhu na Instagramu
a Facebooku). Kreslí ji `drawShareCard()` do canvasu a existuje pro každé skóre 0–20:

| Skóre (dle percentilu) | Plocha | Nálepka | Výzva dole |
|---|---|---|---|
| 20 | zlatá | Top 1 % 👑 | Dáš taky všech 20? |
| 🏆 (17–19) | zelená | Top X % 🏆 | Překonáš mě? |
| 🏅 (9–16) | modrá | Top X % 🏅 | Překonáš mě? |
| bez trofeje (0–8) | fialová | Zítra to dám! 👍 | Dáš to líp? |

Od série 2 má každá karta vpravo nahoře nálepku „N dní v řadě 🔥“.
Vždy je tam nápis „20 SLOV“ z kostek písmen, datum (ne „den N“: podle data si hráči porovnají výsledky), obří skóre „N z 20 slov“,
mřížka dne na tmavé desce a adresa hry.

Pochlubit se → sheet s náhledem karty → „Sdílet obrázek“ (mobil:
`navigator.share({ files })`) nebo „Stáhnout obrázek“ (desktop). Karta se
kreslí předem při zobrazení výsledku, takže náhled naskočí hned. Když kreslení
selže, sdílí se původní text s emoji mřížkou (`buildShareMessage`).

### Body za aktivitu (karma)

Za všechno, co drží hráče ve hře nebo pomáhá komunitě, sbírá body. Vidí je
**jen v profilu** (zlatý odznak pod jménem, vlastní i veřejný `/u/`), jinde
ve hře nejsou. Mají je jen účty, protože většina zdrojů je v D1 u `user_id`.

| Za co | Bodů | Strop |
|---|---|---|
| odehraná denní výzva (s jakýmkoli skóre) | 10 | 1× za den z povahy věci |
| uhodnuté slovo v tréninku | 1 | 10 slov za den |
| přidaný význam | 5 | limit 20 významů za den už platí |
| hlas, který tvůj význam dostal | 2 | bez stropu, to je signál kvality |
| hlas, který jsi dal | 1 | 10 hlasů za den |

Body **nemají vlastní tabulku**. `points()` ve `worker/src/profile.js` je
spočítá jedním dotazem z `profile_days`, `training_days`, `definitions`
a `votes`. Díky tomu nejdou napočítat dvakrát, odebraný hlas nebo význam
skrytý po nahlášení je hned odečte a změna vah (`BODY`, `ZA_DEN`) platí
zpětně pro všechny. Body tak můžou i ubýt, stejně jako karma na Redditu.
Jediná nová data jsou `training_days`: trénink se jinak nikam neukládá.
Klient po každém uhodnutém slově pošle `POST /api/training` a strop se
uplatní až při čtení.

Stropy jsou proti farmení. Klient si trénink tvrdí sám (stejně jako
`/api/result`) a hlasování „všeho“ by kazilo pořadí významů.

Stropy jsou tiché: hráč o nich nikde neví, další body se prostě nezapočtou.

### Úspěchy

27 odznaků v 7 skupinách (Začátky, Série, Denní výzva, Sbírka, Trénink,
Významy, Tajné). Seznam, prahy a markup jsou v `public/achievements.js`.
Stejný soubor používá hra, worker (veřejný profil) i `dev-uspechy.html`.

- **Vzhled:** kostka s retem, bílý medailon, ikona z `designs/kostky/`,
  u postupových odznaků číslo prahu. **Barva = vzácnost**: zelená běžný,
  modrá vzácný, fialová epický, zlatá legendární (s odleskem).
- **Zamčené jsou vidět dopředu:** šedý stín ikony a postup („Ještě 3 dny!“).
  „Na dosah“ ukazuje tři nejbližší. Tajné mají jen `???` a nápovědu.
- **Snadné hned na začátku:** první den, vlastní avatar, první význam.
  Trochu práce chtějí Rozcvička (5 slov tréninku v řadě) a Chlouba (karta
  sdílená ve 3 různých dnech). Se všemi čtyřmi Začátky za jedno sezení
  to bylo moc snadné (2026-09-24).
- **Odemčení:** `syncAchievements()` zapíše datum do `persist.achGot`.
  Získaný odznak už nezmizí, ani když počet klesne. Nový dostane červenou
  tečku na Profilu a u dlaždice, první otevření je oslava „Nový úspěch!“.
- **Oznámení nikdy nepřeruší aktivitu.** Nový úspěch čeká v `persist.achQueue`,
  dokud není klid: odhalení výsledku doběhne, hráč ukončí trénink, zavře
  se jiný sheet. Pak vyjede oslava nad obrazovkou, kam hráč stejně šel,
  a po zavření tam zůstane. Víc úspěchů jde po sobě. Úspěchy z historie
  (první spuštění s úspěchy) se neoznamují, jen svítí tečkou.
- **„Má ho X % hráčů“:** klient hlásí id získaných na `POST /api/achievements`
  (podle `clientId`, i bez účtu). `GET /api/achievements/stats` vrací procenta
  z počtu zařízení, hodinová cache na edge, pod 15 zařízeními nic.
  U přihlášeného se id zapíšou i k účtu (`user_achievements`). Veřejný profil
  tak ukáže i odznaky, které zná jen klient (sdílení, Bleskovka, tajné).
  Po přihlášení klient pošle všechny znovu (`achSentFor`).
- **Data:** klient skládá stav v `achState()` z `persist` a z
  `/api/me/points`. Server přidal `maxHlasu` a `nejlepsi`. Co jinak nejde
  dopočítat, drží příznaky `persist.ach` (sdílení, rychlost, noc, přesmyčka,
  čistý den) a čítače `practiceBestRun` a `practiceHard`.
- **Série** u odznaků = nejdelší řada odehraných dní, Hattrick = řada dní 20/20.

## 4. Roadmapa

1. ~~**Skutečný percentil**~~ — **hotovo a nasazeno.** Cloudflare Worker + D1
   (`worker/`) na `https://slov2000.slov2000.workers.dev` počítá
   skutečné „Top X % hráčů dneška" ze skutečných výsledků. Dokud den nemá
   aspoň 15 odeslaných výsledků, hra tiše zůstává u statického odhadu.
   Kdyby worker někdy spadl, hra to potichu ustojí — `fetchRealPercentile()`
   při jakékoli chybě vrací `null` a zůstane statický odhad.
   Deploy/redeploy: `worker/README.md`.
2. **Souboj přes odkaz** `?vyzva=<den>` — kamarád si zahraje tvůj den a porovnáte se.
3. OG obrázek výsledku, PWA manifest + push „🔥 Nepřijdeš o sérii?", `#2000slov`.
4. Lehká obfuskace slovníku (aktuálně čitelný — pro casual hru OK).

## 5. Technika

- Čistý HTML/CSS/JS bez buildu a závislostí.
- **Jeden Cloudflare Worker servíruje statiku i API**: `public/` jde přes
  `[assets]`, `/api/*` si bere `worker/src/index.js` (viz `wrangler.toml`).
  Jedna doména → žádné CORS a session může být `HttpOnly` cookie.
- `public/index.html` + `style.css` + `game.js` + `words.js` (WORDS + PRACTICE_WORDS + ALTS).
- Stav v `localStorage` (`slov2000_v2`): `results` (index dne → skóre), série,
  statistiky, rozehraný den. Číslo dne se nedrží ve stavu — počítá se z data.
- Slovník: 25 398 hesel z Kategorie:Česká substantiva (cs.wiktionary.org, MediaWiki
  API), zúženo na jednoslovná malá písmena délky 3+, odfiltrovány
  homografy-nesubstantiva (křížová kontrola s kategoriemi příslovcí, spojek,
  předložek, zájmen, číslovek, citoslovcí, částic, zkratek) a vulgarismy, pak
  **morfologický filtr MorphoDiTa** — v seznamu zůstanou jen slova s jmenným
  čtením v 1. pádě a bez adjektivního/zájmenného čtení pod vlastním lemmatem
  (vyhodí *starý, denní, psí, měl, naši*; nechá *stát, moc, večer, peklo*).
  ~110 sporných případů ručně v `tools/pos_overrides.txt`.
  Pool = 13 000 slov s frekvencí v OpenSubtitles 2018 `cs_full` (práh ≥ 5)
  **+ 2000 dalších** doložených ve `wordfreq` `cs` = **15 000**.
  Pořadí = **průměr dvou pořadí** (OpenSubtitles + wordfreq `cs`), takže slovo
  musí být běžné v mluveném i psaném jazyce — tlumí to homografy, na kterých
  jeden zdroj přestřelí (`měl`, `plzeň`) i titulkový slang (`osle`, `lízo`).
  Anagramové kolize řeší mapa ALTS — **uplatní se ale jen v tréninku**
  (`isAcceptedWord()` končí na `state.mode !== 'practice'`), protože denní výzva
  je soutěž a musí v ní padnout přesně hledané slovo. ALTS drží původní ruční
  kuraci a k ní automaticky dopočítané přesmyčky uvnitř poolu.
- **Dva pooly ve `words.js`**: `WORDS` = 7300 slov denní výzvy **už v pořadí
  dnů** (365 × 20, `dayWords(dayIndex())` jen krájí po dvaceti), `PRACTICE_WORDS`
  = celý pool 15 000 slov seřazený podle frekvence, používá ho jen trénink
  (`startPracticeGame()`), nezávisle na datu.
- Testovací nasazení: jednosouborová verze (`inline` CSS/JS/slovník/fonty) se
  generuje skriptem a publikuje jako Claude Artifact; produkce = `npx wrangler deploy`.
- Backend (volitelný): `worker/` — Cloudflare Worker + D1 pro skutečné
  percentily. Bez něj hra běží stejně, jen se statickým odhadem. Viz
  `worker/README.md`.
