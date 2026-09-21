# tools

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
