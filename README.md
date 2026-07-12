# 2000 slov 🇨🇿

**100 dní. Jen podstatná jména, od nejběžnějších po nejvzácnější. 30 sekund na slovo. Jedna chyba = celý den znovu.**

Česká denní slovní hra po vzoru [18words.com](https://18words.com/) — stejný vizuál
i herní pocit. Každý den 20 slov s přeházenými písmeny, na každé 30 sekund.
Nestihnuté slovo se v mřížce zbarví červeně a hraje se dál — ale postoupíš jen
se všemi 20 zelenými, jinak stejný den opakuješ zítra. Hraje se jednou denně.

Obtížnost roste **přirozeně podle frekvence slova**: den 1 jsou nejběžnější
podstatná jména (moc, den, život, práce, čas…), a jak dny přibývají, slova
řídnou v běžné řeči — až po vzácné a knižní výrazy na konci hry. Délka slova
nehraje roli, řadí se čistě podle toho, jak často se slovo vyskytuje.

Denní hra má přesně **2000 slov (100 dní)**. Trénink navíc čerpá z celého
podkladového **frekvenčního poolu 13 000 slov**, bez omezení na odemčený postup.

## Spuštění

Čistě statická stránka bez závislostí — stačí otevřít `index.html`, nebo:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

**Nasazení:** GitHub Pages (Settings → Pages → Source: GitHub Actions).
Workflow `.github/workflows/pages.yml` nasadí při každém pushi. Není potřeba
žádný build.

## Soubory

| Soubor | Obsah |
|---|---|
| `index.html` | struktura aplikace (obrazovky, modaly) |
| `style.css` | světlý design po vzoru originálu (Baloo 2 + Nunito) |
| `game.js` | herní logika, časovač, stav v localStorage, sdílení |
| `words.js` | 2000 podstatných jmen pro denní hru (`WORDS`) + širší pool 13 000 pro trénink (`PRACTICE_WORDS`), řazeno podle frekvence + mapa uznávaných přesmyček |
| `GAME_DESIGN.md` | kompletní game design + plán virality |
| `worker/` | volitelný backend (Cloudflare Worker + D1) pro skutečné „Top X % hráčů dneška" — viz `worker/README.md` |

## Slovní zásoba

Zdroj: [cs.wiktionary.org](https://cs.wiktionary.org/wiki/Kategorie:%C4%8Cesk%C3%A1_substantiva),
**Kategorie:Česká substantiva** — 25 247 hesel stažených kompletně přes MediaWiki API.

Zpracování:
1. **Jen jednoslovná, malými písmeny** (vlastní jména a víceslovná spojení pryč) → 20 244.
2. **Jen délka 3+ písmen** → 20 194.
3. **Odfiltrovány homografy**, které se do kategorie dostaly omylem
   (funkční slova jako *jen, jak, bez, líto, kolik* sdílející pravopis s řídkým
   podstatným jménem, pár čistých citoslovcí a slovesných infinitivů) — ověřeno
   křížovou kontrolou s kategoriemi příslovcí, spojek, předložek, zájmen,
   číslovek a citoslovcí. Slova s reálným významem podstatného jména (např.
   *stát, škoda, moc, kus, růst*) záměrně **zůstala**, i když mají druhotně
   i jiný slovní druh.
4. Odfiltrovány vulgarismy.
5. **Seřazeno čistě podle frekvence výskytu** z [OpenSubtitles 2018](https://github.com/hermitdave/FrequencyWords)
   (celý korpus `cs_full`, práh výskytu ≥ 5 — vyřadí ultra-vzácný šum a překlepy).
   Podstatná jména, která ve frekvenčním korpusu vůbec nejsou, se do hry
   **nepřidávají** — každé slovo má tedy reálnou frekvenci a délka nehraje roli.
6. Zaokrouhleno na **13 000 slov** (ořízne 320 nejvzácnějších z ~13 320) — to je celý
   podkladový pool, ze kterého čerpá trénink (`PRACTICE_WORDS`).
7. Denní hra (`WORDS`) používá jen prvních **2000 slov** (100 dní) z tohoto
   frekvenčně seřazeného poolu — nejběžnější podstatná jména.

Jako správná odpověď se navíc uznává i jiné platné české slovo složené ze
stejných písmen (1234 hesel má alternativu, např. rok/okr, zem/mez).
