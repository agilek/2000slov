# 2000 slov — Game Design

> **365 dní. 7300 podstatných jmen. 30 sekund na slovo. Každý den hrají všichni to samé.**

Věrná česká adaptace hry [18words.com](https://18words.com/) — stejný vizuál
(světlé pozadí, fonty Baloo 2 + Nunito, kulaté dlaždice, pilulková tlačítka),
stejný herní pocit, ale s vlastním rokem **7300 českých podstatných jmen**.
Trénink navíc čerpá z celého podkladového poolu **15 000 slov**, bez omezení
na datum.

## 1. Základní smyčka

- **Denní výzva** má **7300 českých podstatných jmen** (Wikislovník, Kategorie:Česká
  substantiva) rozdělených do **365 dní** po 20 slovech. Jde o 7300 nejběžnějších
  slov širšího poolu 15 000 slov — trénink čerpá z celého poolu (viz níže).
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
- **Všech 20 zelených** → den zvládnut, série pokračuje.
- **Jakékoli červené** → série se trhá. Den se ale neopakuje — zítra přijde
  další datum a s ním nových 20 slov. Nedohraný den se už nevrátí (až za rok).
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
   Sbírka slov + Trénink, řádek se zpětnou vazbou. Perfektní den = konfety.
5. **Sbírka** (modal ve stylu archivu originálu) — 365 dní, odehrané se rozbalí
   na 20 slov a ukážou skóre, aktuální „dnes", zbytek zamčený.
6. **Trénink** — nekonečná volná hra ze **všech 15 000 slov** (širší pool než
   denní výzva, bez ohledu na datum). **Nemá výsledkovou obrazovku ani žádné
   tlačítko „pokračovat"** — nestihnuté slovo se odhalí, na místě časovače
   naskočí odpočet „Další slovo za 3 s" a další slovo naběhne samo.
   Správně složené slovo se posune hned (~0,75 s), bez odpočtu. Jediný způsob,
   jak trénink ukončit, je křížek vpravo nahoře. Bez vlivu na denní výzvu.

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

Text sdílení (formát originálu, mřížka 4×5):

```
⏳ 2000 slov — den #12

🔥 Získáno 18/20 slov

🟩🟩🟩🟥🟩
🟩🟩🟩🟩🟩
🟩🟩🟩🟩🟩
🟩🟥🟩🟩🟩

🏆 Top 10 % hráčů dneška      | 🫵 Překonáš mě?  (varianta Vyzvat kamaráda)

https://…
```

Mobil → nativní share sheet (`navigator.share`), desktop → schránka + toast.

## 4. Roadmapa

1. ~~**Skutečný percentil**~~ — **hotovo a nasazeno.** Cloudflare Worker + D1
   (`worker/`) na `https://slov2000-api.slov2000.workers.dev` počítá
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
  Anagramové kolize řeší mapa ALTS (uznaná alternativa = správně); pokrývá
  původních 13 000 slov, 2000 nově doplněných zatím ne.
- **Dva pooly ve `words.js`**: `WORDS` = 7300 slov denní výzvy **už v pořadí
  dnů** (365 × 20, `dayWords(dayIndex())` jen krájí po dvaceti), `PRACTICE_WORDS`
  = celý pool 15 000 slov seřazený podle frekvence, používá ho jen trénink
  (`startPracticeGame()`), nezávisle na datu.
- Testovací nasazení: jednosouborová verze (`inline` CSS/JS/slovník/fonty) se
  generuje skriptem a publikuje jako Claude Artifact; produkce = `npx wrangler deploy`.
- Backend (volitelný): `worker/` — Cloudflare Worker + D1 pro skutečné
  percentily. Bez něj hra běží stejně, jen se statickým odhadem. Viz
  `worker/README.md`.
