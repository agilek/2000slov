# 10 000 slov 🇨🇿

**500 dní. 10 000 nejčastějších českých slov (ČNK SYN2005). 30 sekund na slovo. Jedna chyba = celý den znovu.**

Česká denní slovní hra po vzoru [18words.com](https://18words.com/) — stejný vizuál
i herní pocit. Každý den 20 slov s přeházenými písmeny, na každé 30 sekund.
Nestihnuté slovo se v mřížce zbarví červeně a hraje se dál — ale postoupíš jen
se všemi 20 zelenými, jinak stejný den opakuješ zítra. Hraje se jednou denně.

## Spuštění

Čistě statická stránka bez závislostí — stačí otevřít `index.html`, nebo:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

**Nasazení:** zapni GitHub Pages (Settings → Pages → Deploy from branch, složka `/root`).
Není potřeba žádný build.

## Soubory

| Soubor | Obsah |
|---|---|
| `index.html` | struktura aplikace (obrazovky, modaly) |
| `style.css` | světlý design po vzoru originálu (Baloo 2 + Nunito) |
| `game.js` | herní logika, časovač, stav v localStorage, sdílení |
| `words.js` | 10 000 slov podle frekvence (ČNK SYN2005) + mapa uznávaných přesmyček |
| `GAME_DESIGN.md` | kompletní game design + plán virality |

## Slovní zásoba

10 000 nejčastějších českých slov z frekvenčního seznamu Českého národního korpusu
**SYN2005** ([cs.wiktionary.org, Příloha: Frekvenční seznam](https://cs.wiktionary.org/wiki/P%C5%99%C3%ADloha:Frekven%C4%8Dn%C3%AD_seznam_(%C4%8De%C5%A1tina))),
staženo kompletně (10 podstránek po 1000). Očištěno o 3 duplicity a 1 rozbitý odkaz
zdroje a doplněno na přesných 10 000 z OpenSubtitles 2018 (validace hunspell `cs_CZ`).
Pořadí podle frekvence = přirozeně rostoucí obtížnost. Víceslovná hesla („zeptat se")
mají nepísmenné znaky ve hře pevně předvyplněné. Jako správná odpověď se uznává
i jiné platné české slovo ze stejných písmen (559 hesel má alternativu).
