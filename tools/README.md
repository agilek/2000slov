# tools

## `cz_font.py` + `thin_font.py` — písmo Slovka One

```bash
python -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli skia-pathops
F=FredokaOne-Regular.otf   # originál z 2011, jediný zdroj všech tří řezů
/tmp/fontenv/bin/python tools/cz_font.py $F /tmp/r.otf public/fonts/SlovkaOne-Regular.woff2
/tmp/fontenv/bin/python tools/cz_font.py $F /tmp/l.otf public/fonts/SlovkaOne-Light.woff2 --thin 24 --style Light --weight 300
/tmp/fontenv/bin/python tools/cz_font.py $F /tmp/x.otf public/fonts/SlovkaOne-ExtraLight.woff2 --thin 40 --style ExtraLight --weight 200
```

Lehčí řezy nejsou z jiné rodiny (variabilní Google „Fredoka" je jiný kresebný
základ — menší x-výška i verzálky), ale erozí obrysu Fredoka One; postup
a změřené konstanty jsou v hlavičce `thin_font.py`. Čeština se doplňuje až po
zeslabení, takže háčky a apostrofy sedí na glyfy dané váhy. CSS pásma
`font-weight` (Regular 400–900, Light 250–399, ExtraLight 100–249) jsou
v `designs/kostky.css` — nic, co appka používá, nesmí spadnout pod 400.

## `build_words.py` — generátor `words.js`

```bash
pip install wordfreq
python3 tools/build_words.py     # stáhne zdroje do .wordcache/ (gitignore) a přepíše public/words.js
```

Tři věci, které se z kódu nevyčtou:

**`vetted_pool.txt` je zdroj, ne mezivýsledek.** 13 000 substantiv v pořadí
podle OpenSubtitles 2018 `cs_full`. Nese kurátorská rozhodnutí, která
z Wikislovníku automaticky nezrekonstruuješ: `stát`, `moc`, `škoda`, `kus`
a `růst` mají zůstat (reálně fungují jako podstatná jména), `měl` ne, i když
v Kategorii:Česká substantiva formálně je — je to hlavně tvar slovesa *mít*
a jakýkoli frekvenční zdroj ho vystřelí do první desítky. Skript na tento
soubor jen navazuje. Kdyby se ztratil, kurace je pryč (už se to jednou stalo).

**Mapa `ALTS` se negeneruje.** Skript ji beze změny přepíše ze stávajícího
`words.js`. Původní kurace uznávaných přesmyček se nedala zrekonstruovat —
kontroloval ji nějaký český slovník, ne frekvenční práh: `efka` je uznané
(zipf 1,55), `fake` ne (zipf 3,38). Proto se ručně kurátorovaná část **přebírá
beze změny** a skript k ní jen **dopočítá přesmyčky uvnitř poolu**: pro každou
skupinu slov ze stejných písmen doplní vzájemné vazby. Slovo, které hra zná,
tak nikdy neprojde jako chyba (*síla/lísa*, *nárok/korán/orkán*).

**`pos_overrides.txt` je hranice, ne seznam výjimek.** Morfologie (MorphoDiTa)
vyřeší drtivou většinu — `starý`, `denní`, `psí` ven, `stát`, `moc`, `peklo`
dovnitř. Neumí ale rozhodnout zpodstatnělá přídavná jména: `vedoucí` (člověk)
a `taneční` (přídavné jméno) mají identické značky, protože čeština tohle tvoří
produktivně. Čára, kterou soubor drží: ANO jen jména pro člověka podle role či
povolání (`vedoucí`, `účetní`, `vrátný`, `obviněný`) a nesklonná přejatá
substantiva (`video`, `rock`, `jazz`); NE cokoli, co se běžně používá jako
přídavné jméno (`známý`, `mrtvý`, `domácí`, `podezřelý`), i když to jde
v kontextu zpodstatnit. Když budeš seznam rozšiřovat, drž tuhle čáru,
ať to nesklouzne k „co zrovna vypadá jako slovo".

Pokud `words.js` přegeneruješ, **změní se i rozdělení slov do dnů** — hráči
dostanou v daný den jiná slova než předtím. Seed (`SEED = 20260921`) drží
rozdělení stabilní, dokud se nezmění vstupní pool.

## `cz_font.py` — české znaky do Fredoka One

Fredoka One (2011, OFL) má Š/Ž a čárky, ale chybí ů č ď ě ň ř ť a Ů Č Ď Ě Ň Ř Ť.
Skript je doplní jako TrueType složeniny písmeno + znaménko (polohy změřené z hotových
Š/š a å, u ď/ť zmenšený apostrof), převezme kerning a uloží kopii jako **Slovka One**
— licence OFL vyhrazuje jméno „Fredoka", upravená verze ho nést nesmí.

```bash
python -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli
/tmp/fontenv/bin/python tools/cz_font.py FredokaOne-Regular.otf SlovkaOne-Regular.otf public/fonts/SlovkaOne-Regular.woff2
```

Hra používá `public/fonts/SlovkaOne-Regular.woff2` na nadpisy (`designs/kostky.css`),
licence je vedle v `public/fonts/OFL.txt`.

