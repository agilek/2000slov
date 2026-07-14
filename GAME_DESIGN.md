# 2000 slov — Game Design

> **100 dní. 2000 podstatných jmen, od nejběžnějších po nejvzácnější. 30 sekund na slovo. Jedna chyba = celý den znovu.**

Věrná česká adaptace hry [18words.com](https://18words.com/) — stejný vizuál
(světlé pozadí, fonty Baloo 2 + Nunito, kulaté dlaždice, pilulková tlačítka),
stejný herní pocit, ale s vlastní progresí přes **2000 českých podstatných jmen**
seřazených podle frekvence výskytu. Trénink navíc čerpá z celého podkladového
poolu **13 000 slov**, bez omezení na denní postup.

## 1. Základní smyčka

- Denní hra má **2000 českých podstatných jmen** (Wikislovník, Kategorie:Česká
  substantiva) rozdělených do **100 dní** po 20 slovech. Jde o prvních 2000 slov
  širšího frekvenčního poolu 13 000 slov — trénink čerpá z celého poolu (viz níže).
- **Obtížnost roste přirozeně podle frekvence slova**, ne podle délky: den 1
  jsou nejběžnější podstatná jména (moc, den, život, práce, čas… — různých
  délek), a jak dny přibývají, slova řídnou v běžné řeči — až po vzácné
  a knižní výrazy na samém konci. Řadí se čistě podle toho, jak často se slovo
  vyskytuje v korpusu, délka nehraje roli.
- Každé slovo se zobrazí jako **kruhové dlaždice s přeházenými písmeny**.
  Hráč má **30 sekund** složit slovo klepáním na písmena (nebo psaním na klávesnici).
- Po vybrání všech písmen se slovo **vyhodnotí automaticky** (žádné tlačítko Potvrdit):
  - správně → zelený puls, další slovo (časovač se animovaně dotočí zpět na 30 s),
  - špatně → červené zatřesení, výběr se vrátí, **časovač běží dál** — zkoušíš znovu,
  - vyprší čas → hledané slovo se červeně odhalí, políčko v mřížce zčervená a **hraje se dál**.
- Hraje se vždy **všech 20 slov**. Mřížka 4×5 nahoře se plní zeleně/červeně.
- **Všech 20 zelených** → den zvládnut, slova se odkryjí do sbírky, zítra další den.
- **Jakékoli červené** → stejných 20 slov se opakuje zítra.
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
| Opakování dne | Není trest — slova už znáš, zítřek je snazší (skryté učení) |
| Odkrývání 2000 slov | Sběratelský progres a dlouhodobý závazek (100 dní hraní) |
| Frekvence = obtížnost | Den 1 zvládne každý (nejběžnější slova), pozdní dny jsou expertní |

## 2. Obrazovky (zrcadlí originál)

1. **Welcome** — šedá mřížka 4×5 (po odehrání barevná), nadpis, instrukce,
   klikací řádek „DEN 12/100 · 220/2000 SLOV" (otevře sbírku), zelené tlačítko Hrát.
2. **Hra** — mřížka, „SLOVO 3/20", velký časovač, rámečky pro odpověď, kruhová písmena.
   Klik na rámečky zruší výběr, Shift zamíchá písmena (FLIP animace, 1× na slovo).
3. **Pauza** — celoobrazovkově při přepnutí okna/tabu; jen Pokračovat (žádný restart —
   restart by obcházel pravidlo jednoho pokusu).
4. **Výsledek** — mřížka se přesune nahoru, postupné odkrývání řádků:
   „Máš všech 20 slov!" / „Máš 17 z 20 slov!", trofejová řádka, věta o postupu/opakování,
   Sdílet skóre (zelená) + Vyzvat kamaráda (modrá), odpočet do půlnoci,
   Sbírka slov + Trénink, řádek se zpětnou vazbou. Perfektní den = konfety.
5. **Sbírka** (modal ve stylu archivu originálu) — 100 dní, zvládnuté se rozbalí
   na 20 slov, aktuální „dnes", zbytek zamčený.
6. **Trénink** — volná hra na přežití ze **všech 13 000 slov** (širší pool než
   denní hra, bez ohledu na denní postup), první nestihnuté slovo končí
   („X slov v řadě!"). Bez vlivu na denní hru.

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
   Kdyby worker někdy spadl/přestal existovat, hra to potichu ustojí —
   `API_BASE` v `game.js` je jediné místo, které to zapíná; prázdný
   řetězec = jen statický odhad jako dřív. Deploy/redeploy: `worker/README.md`.
2. **Souboj přes odkaz** `?vyzva=<den>` — kamarád si zahraje tvůj den a porovnáte se.
3. OG obrázek výsledku, PWA manifest + push „🔥 Nepřijdeš o sérii?", `#2000slov`.
4. Lehká obfuskace slovníku (aktuálně čitelný — pro casual hru OK).

## 5. Technika

- Čistý HTML/CSS/JS bez buildu a závislostí → GitHub Pages zdarma.
- `index.html` + `style.css` + `game.js` + `words.js` (WORDS + PRACTICE_WORDS + ALTS).
- Stav v `localStorage` (`slov2000_v2`): úroveň, série, statistiky, rozehraný den.
- Slovník: 25 247 hesel z Kategorie:Česká substantiva (cs.wiktionary.org, MediaWiki
  API), zúženo na jednoslovná malá písmena délky 3+ (20 194), odfiltrovány
  homografy-nesubstantiva (ověřeno křížovou kontrolou s kategoriemi příslovcí,
  spojek, předložek, zájmen, číslovek, citoslovcí) a vulgarismy, pak seřazeno
  **čistě podle frekvence** (OpenSubtitles 2018 `cs_full`, práh výskytu ≥ 5).
  Slova mimo frekvenční korpus se nepřidávají; zaokrouhleno na 13 000.
  Anagramové kolize řeší mapa ALTS (uznaná alternativa = správně).
- **Dva pooly ve `words.js`**: `WORDS` je prvních 2000 slov tohoto frekvenčního
  poolu (denní hra, 100 dní × 20 slov, `TOTAL_WORDS`/`TOTAL_LEVELS` v `game.js`)
  — jde tedy i o název hry. `PRACTICE_WORDS` je celý pool 13 000 slov a používá
  ho jen trénink (`startPracticeGame()`), nezávisle na tom, kolik dní hráč
  odemkl v denní hře.
- Testovací nasazení: jednosouborová verze (`inline` CSS/JS/slovník/fonty) se
  generuje skriptem a publikuje jako Claude Artifact; produkce = GitHub Pages.
- Backend (volitelný): `worker/` — Cloudflare Worker + D1 pro skutečné
  percentily. Bez něj hra běží stejně, jen se statickým odhadem. Viz
  `worker/README.md`.
