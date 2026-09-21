# 2000 slov 🇨🇿

**365 dní. Jen podstatná jména. 30 sekund na slovo. Každý den hrají všichni to samé.**

Česká denní slovní hra po vzoru [18words.com](https://18words.com/) — stejný vizuál
i herní pocit. Každý den 20 slov s přeházenými písmeny, na každé 30 sekund.
Nestihnuté slovo se v mřížce zbarví červeně a hraje se dál. Hraje se jednou denně.

**Denní výzva je vázaná na datum, ne na postup hráče** — kdo hraje 21. září,
dostane stejných 20 slov jako každý jiný hráč téhož dne, takže se výsledky dají
porovnávat. Zítra přijde další den bez ohledu na dnešní výsledek; nestihnuté
slovo jen přetrhne sérii.

Obtížnost je **mezi dny vyrovnaná**: 7300 slov denní výzvy je rozděleno do
20 frekvenčních pásem po 365 slovech a každý den dostane právě jedno slovo
z každého pásma. Každý den tak má stejný mix běžných a vzácných slov — žádný
den není systematicky těžší než jiný. Délka slova nehraje roli.

Denní výzva má **7300 slov (365 dní)**. Trénink navíc čerpá z celého
podkladového **frekvenčního poolu 15 000 slov**, bez omezení na datum — běží
nekonečně dokola a nic v něm neklikáš: po nestihnutém slově se odpočítají
3 sekundy a další slovo naběhne samo. Ukončíš ho křížkem vpravo nahoře.

## Spuštění

Hra i API běží jako **jeden Cloudflare Worker**: statiku z `public/` servírují
`[assets]`, cesty `/api/*` si bere `worker/src/index.js` (viz `wrangler.toml`).
Díky tomu je všechno na jedné doméně — žádné CORS a session může být
`HttpOnly` cookie.

```bash
npx wrangler d1 execute slov2000 --local --file=worker/schema.sql   # jednou
npx wrangler dev --port 8787
# → http://localhost:8787
```

Samotná statika je pořád bez závislostí a bez buildu, takže na rychlou úpravu
vzhledu stačí i `python3 -m http.server 8000` v `public/` — jen bez `/api/*`.

**Nasazení:** `npx wrangler deploy`, nebo automaticky workflow
`.github/workflows/deploy.yml` při pushi do `main` (potřebuje secret
`CLOUDFLARE_API_TOKEN`). Statika a worker jdou ven společně.

## Soubory

| Soubor | Obsah |
|---|---|
| `wrangler.toml` | konfigurace Workeru: statika z `public/`, `/api/*` do workeru, D1, cron |
| `public/index.html` | struktura aplikace (obrazovky, modaly) |
| `public/style.css` | světlý design po vzoru originálu (Baloo 2 + Nunito) |
| `public/game.js` | herní logika, časovač, stav v localStorage, sdílení |
| `public/words.js` | 7300 podstatných jmen denní výzvy (`WORDS`, v pořadí dnů) + širší pool 15 000 pro trénink (`PRACTICE_WORDS`, řazeno podle frekvence) + mapa uznávaných přesmyček |
| `tools/` | generátor slovníku (`build_words.py`) + prověřený pool — **neservíruje se** |
| `GAME_DESIGN.md` | kompletní game design + plán virality |
| `worker/` | backend (Cloudflare Worker + D1): percentily, Web Push — viz `worker/README.md` |

## Slovní zásoba

Zdroj: [cs.wiktionary.org](https://cs.wiktionary.org/wiki/Kategorie:%C4%8Cesk%C3%A1_substantiva),
**Kategorie:Česká substantiva** — 25 398 hesel stažených kompletně přes MediaWiki API.

Zpracování:
1. **Jen jednoslovná, malými písmeny** (vlastní jména a víceslovná spojení pryč) → 20 244.
2. **Jen délka 3+ písmen** → 20 194.
3. **Odfiltrovány homografy**, které se do kategorie dostaly omylem
   (funkční slova jako *jen, jak, bez, líto, kolik* sdílející pravopis s řídkým
   podstatným jménem, pár čistých citoslovcí a slovesných infinitivů) — ověřeno
   křížovou kontrolou s kategoriemi příslovcí, spojek, předložek, zájmen,
   číslovek a citoslovcí.
4. Odfiltrovány vulgarismy.
4b. **Morfologický filtr — jen podstatná jména** ([MorphoDiTa](https://lindat.mff.cuni.cz/services/morphodita/),
   ÚFAL LINDAT). Kategorie Wikislovníku samy nestačí: heslo je
   v Kategorii:Česká substantiva, i když je jmenný význam okrajový, takže
   v seznamu zůstávala přídavná jména (*starý, denní, psí, kuřecí*), tvary
   sloves (*měl, jedl, kopal*) i zájmen (*naši, vaši*). Projde jen slovo, které
   **má čtení jako obecné podstatné jméno v 1. pádě** (nebo je nesklonné —
   *madam, zoo*) a zároveň **nemá pod vlastním lemmatem** čtení jako přídavné
   jméno, zájmeno, číslovka, spojka, předložka, částice ani citoslovce.
   Slovesné a příslovečné homografy **zůstávají** — *stát, růst, peklo, brána,
   pila, osel, moc, večer, ticho* jsou podstatná jména, i když se stejně píše
   i něco jiného.
   Zbylých ~110 případů rozhoduje ručně `tools/pos_overrides.txt`: čeština
   tvoří podstatná jména z přídavných produktivně, takže *vedoucí* (člověk)
   a *taneční* (přídavné jméno) mají úplně stejné značky. Uznaná jsou jen
   zpodstatnělá jména pro člověka podle role či povolání (*vedoucí, účetní,
   vrátný, obviněný*) a nesklonná přejatá substantiva (*video, rock, jazz,
   fitness*); co se běžně používá jako přídavné jméno, padá (*známý, mrtvý,
   domácí, podezřelý*), i když to jde v kontextu zpodstatnit.
   Filtr vyřadil 522 slov z původních 13 000.
5. **Seřazeno čistě podle frekvence výskytu** z [OpenSubtitles 2018](https://github.com/hermitdave/FrequencyWords)
   (celý korpus `cs_full`, práh výskytu ≥ 5 — vyřadí ultra-vzácný šum a překlepy).
   Podstatná jména, která ve frekvenčním korpusu vůbec nejsou, se do hry
   **nepřidávají** — každé slovo má tedy reálnou frekvenci a délka nehraje roli.
6. Zaokrouhleno na **13 000 slov** (ořízne 320 nejvzácnějších z ~13 320).
7. **Doplněno na 15 000** o další substantiva z téže kategorie, která
   v OpenSubtitles nemají frekvenci (a tak do kroku 5 nedošla), ale mají
   doložený výskyt v [wordfreq](https://github.com/rspeer/wordfreq) `cs`.
   Tohle je celý pool, ze kterého čerpá trénink (`PRACTICE_WORDS`).
8. **Přeřazeno podle průměru dvou pořadí** — OpenSubtitles 2018 (mluvený
   jazyk) a wordfreq `cs` (Wikipedie, zpravodajství, web, titulky). Slovo musí
   být běžné v obou, což tlumí homografy, na kterých jeden zdroj přestřelí:
   `měl` (tvar slovesa *mít*) spadne z 2. na 6334. místo, `plzeň` ze 145. na
   4918., naopak titulkový slang a vokativy (`osle`, `lízo`) padají z prvních
   tisíců mimo denní výzvu.
9. Denní výzva (`WORDS`) bere prvních **7300 slov** (365 dní). Ta se rozdělí
   do 20 frekvenčních pásem po 365 slovech a **každý den dostane náhodně
   (seed 20260921) právě jedno slovo z každého pásma**. Dny tak mají
   srovnatelnou obtížnost a — protože pořadí je napevno v `words.js` a den se
   počítá od data — hraje v daný den každý hráč stejných 20 slov.
10. Kontrola tematických shluků uvnitř dne (stejné téma nebo stejný kmen).
   Pásmování samo odstraní skoro všechno — slova jednoho tématu mají podobnou
   frekvenci, takže padnou do stejného pásma a do jednoho dne se nedostanou.
   Zbylých 6 dnů opraveno prohozením slova ve stejném pásmu.

Jako správná odpověď se navíc uznává i jiné platné české slovo složené ze
stejných písmen (1234 hesel má alternativu, např. rok/okr, zem/mez). Mapa
přesmyček má dvě části: ručně kurátorovanou z původního slovníku (uznává
i tvary, které v poolu nejsou — *otec* → *ocet, otce*) a automaticky doplněné
**přesmyčky uvnitř poolu** — když jde ze stejných písmen složit jiné slovo,
které hra sama zná, uzná se taky (*síla/lísa*, *vlas/sval*, *nárok/korán/orkán*).
