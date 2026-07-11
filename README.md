# 2000 slov 🇨🇿

**100 dní. 2000 nejčastějších českých slov. 30 sekund na slovo. Jedna chyba = celý den znovu.**

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
| `words.js` | 2000 slov podle frekvence + mapa uznávaných přesmyček |
| `GAME_DESIGN.md` | kompletní game design + plán virality |

## Slovní zásoba

2000 nejčastějších českých slov z frekvenčního seznamu
[OpenSubtitles 2018](https://github.com/hermitdave/FrequencyWords) (MIT),
validováno slovníkem `cs_CZ` (hunspell), bez vulgarismů, vlastních jmen
a anagramových duplicit. Pořadí podle frekvence = přirozeně rostoucí obtížnost.
