# 2000 SLOV 🇨🇿

**100 dní. 2000 nejčastějších českých slov. Jedna chyba = opakuješ den.**

Denní slovní hra inspirovaná [18words.com](https://18words.com/). Každý den dostaneš
20 českých slov s přeházenými písmeny. Slož všech 20 správně a postoupíš do dalšího dne.
Jedna chyba a celý den opakuješ zítra. Hraje se jednou denně.

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
| `style.css` | tmavý mobile-first design |
| `game.js` | herní logika, stav v localStorage, sdílení |
| `words.js` | 2000 slov seřazených podle frekvence |
| `GAME_DESIGN.md` | kompletní game design + plán virality |

## Slovní zásoba

2000 nejčastějších českých slov z frekvenčního seznamu
[OpenSubtitles 2018](https://github.com/hermitdave/FrequencyWords) (MIT),
validováno slovníkem `cs_CZ` (hunspell), bez vulgarismů, vlastních jmen
a anagramových duplicit. Pořadí podle frekvence = přirozeně rostoucí obtížnost.
