# 20 000 slov — Game Design

> **1001 dní. 20 020 podstatných jmen, od 3 písmen po nejdelší. 30 sekund na slovo. Jedna chyba = celý den znovu.**

Věrná česká adaptace hry [18words.com](https://18words.com/) — stejný vizuál
(světlé pozadí, fonty Baloo 2 + Nunito, kulaté dlaždice, pilulková tlačítka),
stejný herní pocit, ale s vlastní progresí přes **20 020 českých podstatných jmen**
seřazených podle délky slova.

## 1. Základní smyčka

- Ve hře je **20 020 českých podstatných jmen** (Wikislovník, Kategorie:Česká
  substantiva) rozdělených do **1001 dní** po 20 slovech.
- **Obtížnost roste postupně podle délky slova**, ne podle frekvence: den 1
  má nejkratší 3písmenná slova (moc, den, pár, čas…), a jak dny přibývají,
  přidávají se čím dál delší slova — až po 15+ písmenná technická a knižní
  substantiva na samém konci. V rámci každé délkové skupiny jsou napřed
  slova, která hráč zná (řazeno podle frekvence z OpenSubtitles), teprve pak
  vzácnější výrazy stejné délky — takže i "těžký" den začíná povědomým slovem.
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
z herního slovníku + frekvenčního seznamu validovaného hunspellem — 1594 hesel má alternativu.

### Proč to funguje psychologicky

| Prvek | Efekt |
|---|---|
| 30s časovač | Napětí v každém slově, chybný pokus pálí čas |
| Jeden pokus denně | Vzácnost → rituál, důvod se vracet |
| Dohrání všech 20 | I prohraný den dá kompletní, sdílitelnou mřížku |
| Opakování dne | Není trest — slova už znáš, zítřek je snazší (skryté učení) |
| Odkrývání 20 000 slov | Sběratelský progres a dlouhodobý závazek (roky hraní) |
| Délka = obtížnost | Den 1 zvládne každý (3 písmena), pozdní dny jsou expertní |

## 2. Obrazovky (zrcadlí originál)

1. **Welcome** — šedá mřížka 4×5 (po odehrání barevná), nadpis, instrukce,
   klikací řádek „DEN 12/1001 · 220/20 020 SLOV" (otevře sbírku), zelené tlačítko Hrát.
2. **Hra** — mřížka, „SLOVO 3/20", velký časovač, rámečky pro odpověď, kruhová písmena.
   Klik na rámečky zruší výběr, Shift zamíchá písmena (FLIP animace, 1× na slovo).
3. **Pauza** — celoobrazovkově při přepnutí okna/tabu; jen Pokračovat (žádný restart —
   restart by obcházel pravidlo jednoho pokusu).
4. **Výsledek** — mřížka se přesune nahoru, postupné odkrývání řádků:
   „Máš všech 20 slov!" / „Máš 17 z 20 slov!", trofejová řádka, věta o postupu/opakování,
   Sdílet skóre (zelená) + Vyzvat kamaráda (modrá), odpočet do půlnoci,
   Sbírka slov + Trénink, řádek se zpětnou vazbou. Perfektní den = konfety.
5. **Sbírka** (modal ve stylu archivu originálu) — 1001 dní, zvládnuté se rozbalí
   na 20 slov, aktuální „dnes", zbytek zamčený.
6. **Trénink** — slova z už odkrytých, na přežití: první nestihnuté slovo končí
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
⏳ 20 000 slov — den #12

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

1. **Skutečný percentil** — mini-backend (Cloudflare Worker + KV): POST den+skóre,
   GET rozložení. Tabulku nahradí reálná čísla + „Dnešní den zvládlo jen 34 % hráčů."
2. **Souboj přes odkaz** `?vyzva=<den>` — kamarád si zahraje tvůj den a porovnáte se.
3. OG obrázek výsledku, PWA manifest + push „🔥 Nepřijdeš o sérii?", `#2000slov`.
4. Lehká obfuskace slovníku (aktuálně čitelný — pro casual hru OK).

## 5. Technika

- Čistý HTML/CSS/JS bez buildu a závislostí → GitHub Pages zdarma.
- `index.html` + `style.css` + `game.js` + `words.js` (WORDS + ALTS).
- Stav v `localStorage` (`slov2000_v2`): úroveň, série, statistiky, rozehraný den.
- Slovník: 25 247 hesel z Kategorie:Česká substantiva (cs.wiktionary.org, MediaWiki
  API), zúženo na jednoslovná malá písmena délky 3+ (20 194), odfiltrováno ~60
  homografů-nesubstantiv (ověřeno křížovou kontrolou s kategoriemi příslovcí,
  spojek, předložek, zájmen, číslovek, citoslovcí) a vulgarismy, seřazeno podle
  délky a v rámci délky podle frekvence (OpenSubtitles 2018), zarovnáno na
  20 020 (1001 dní). Anagramové kolize řeší mapa ALTS (uznaná alternativa = správně).
- Testovací nasazení: jednosouborová verze (`inline` CSS/JS/slovník/fonty) se
  generuje skriptem a publikuje jako Claude Artifact; produkce = GitHub Pages.
