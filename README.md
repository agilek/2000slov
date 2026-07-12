# 20 000 slov 🇨🇿

**1001 dní. Jen podstatná jména, od 3 písmen po nejdelší. 30 sekund na slovo. Jedna chyba = celý den znovu.**

Česká denní slovní hra po vzoru [18words.com](https://18words.com/) — stejný vizuál
i herní pocit. Každý den 20 slov s přeházenými písmeny, na každé 30 sekund.
Nestihnuté slovo se v mřížce zbarví červeně a hraje se dál — ale postoupíš jen
se všemi 20 zelenými, jinak stejný den opakuješ zítra. Hraje se jednou denně.

Obtížnost roste **postupně podle délky slova**: den 1 začíná nejkratšími
běžnými podstatnými jmény (moc, den, pár…), a jak dny přibývají, přidávají se
delší a vzácnější slova — až po technické a knižní výrazy o 15+ písmenech
na konci hry.

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
| `words.js` | 20 020 podstatných jmen řazených podle délky + mapa uznávaných přesmyček |
| `GAME_DESIGN.md` | kompletní game design + plán virality |
| `worker/` | volitelný backend (Cloudflare Worker + D1) pro skutečné „Top X % hráčů dneška" — viz `worker/README.md` |

## Slovní zásoba

Zdroj: [cs.wiktionary.org](https://cs.wiktionary.org/wiki/Kategorie:%C4%8Cesk%C3%A1_substantiva),
**Kategorie:Česká substantiva** — 25 247 hesel stažených kompletně přes MediaWiki API.

Zpracování:
1. **Jen jednoslovná, malými písmeny** (vlastní jména a víceslovná spojení pryč) → 20 244.
2. **Jen délka 3+ písmen** → 20 194.
3. **Odfiltrováno ~60 homografů**, které se do kategorie dostaly omylem
   (funkční slova jako *jen, jak, bez* sdílející pravopis s řídkým podstatným
   jménem, pár čistých citoslovcí a slovesných infinitivů) — ověřeno křížovou
   kontrolou s kategoriemi příslovcí, spojek, předložek, zájmen, číslovek
   a citoslovcí. Slova s reálným významem podstatného jména (např. *stát,
   škoda, moc, kus, růst*) záměrně **zůstala**, i když mají druhotně i jiný
   slovní druh.
4. Odfiltrovány vulgarismy.
5. **Seřazeno podle délky slova** (od 3 písmen), v rámci každé délky podle
   frekvence z [OpenSubtitles 2018](https://github.com/hermitdave/FrequencyWords)
   — takže i v delší, obtížnější kategorii jsou napřed slova, která hráč zná.
6. Zarovnáno na celé dny po 20 slovech → **20 020 slov, 1001 dní**.

Jako správná odpověď se navíc uznává i jiné platné české slovo složené ze
stejných písmen (1594 hesel má alternativu, např. rok/okr, zem/mez).
