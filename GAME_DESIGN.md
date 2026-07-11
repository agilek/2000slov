# 2000 SLOV — Game Design

> **100 dní. 2000 slov. Jedna chyba = opakuješ den.**

## 1. Základní smyčka

- Ve hře je **2000 nejčastějších českých slov**, rozdělených do **100 dní** po 20 slovech
  (2000 ÷ 20 = přesně 100 — „stodenní výzva" je sama o sobě marketingový příběh).
- Každé slovo se zobrazí s **přeházenými písmeny** (anagram). Hráč ho složí klepáním
  na dlaždice nebo psaním na klávesnici.
- **Všech 20 správně** → den zvládnut, slova se „odkryjí" do sbírky, zítra další den.
- **První chyba den okamžitě končí.** Stejných 20 slov se opakuje zítra.
- **Jeden pokus denně.** Nové kolo o půlnoci (lokální čas).

### Proč to funguje psychologicky

| Prvek | Efekt |
|---|---|
| Jeden pokus denně | Vzácnost → napětí, rituál, důvod se vracet |
| Jedna chyba = konec | Vysoké sázky, každé slovo je „match point" |
| Opakování dne | Není to trest — hráč už slova zná, zítřek je snazší (skryté učení) |
| Odkrývání 2000 slov | Sběratelský progres, „ještě 60 dní a mám všechno" |
| Frekvence = obtížnost | Den 1 hravě zvládne každý (onboarding), den 90 je pro elitu |
| 🔥 série | Ztráta série bolí víc než ztráta dne — retenční háček |

### Detaily mechaniky

- **Deterministické míchání**: zadání dne je pro všechny hráče stejné (seed = datum + slovo)
  → výsledky jsou porovnatelné, dá se o nich bavit.
- **Tlačítko Zamíchat** přehází volné dlaždice náhodně (jen vizuální pomůcka).
- Po prohře se **prozradí hledané slovo** — hráč se poučí a zítra ho už dá.
- Slova, která hráč ten den ještě neviděl, se po prohře **neprozrazují**.
- Nedohraný den (zavřený tab) se počítá jako nehraný — zítra se hraje znovu od začátku.
- Slovník je očištěný o **anagramové duplicity** (žádné slovo ve hře nemá ve hře
  přesmyčku), takže „správná odpověď, jiné slovo" nemůže nastat.

## 2. Obrazovky

1. **Intro** — číslo dne, progress 2000 slov, varování „jeden pokus", tlačítko HRÁT.
   Při opakování dne povzbuzení „🔁 už jsi ho viděl(a), dnes to dáš!".
2. **Hra** — počítadlo Slovo X/20, progress bar, sloty + dlaždice, Smazat / Zamíchat / Potvrdit.
3. **Výsledek** — 🎉/😤, odkrytá slova jako čipy, statistiky (odkryto / 🔥 série / den),
   Sdílet + Vyzvat kamaráda, odpočet do půlnoci.
4. **Sbírka** (📖) — 100 dní jako rozbalovací seznam, odkrytá slova, zamčený zbytek.
5. **Statistiky** (📊) — den, odkrytá slova, série, rekord, pokusy, úspěšnost.
6. **Trénink** — procvičování už odkrytých slov bez rizika (drží hráče u hry i po prohře).

## 3. Viralita

### Zabudováno

- **Náhled sdílení** (po vzoru 18words) — hráč před odesláním vidí přesně, co pošle.
- **Emoji mřížka** à la Wordle — čitelná na první pohled, funguje v každém chatu:
  ```
  2000 SLOV — den 12/100 ✅ 🔥5
  🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩
  🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 20/20
  Odkryto 240/2000 slov
  ```
  Prohra je stejně sdílitelná („podívej, kde jsem umřel"):
  ```
  🟩🟩🟩🟥⬛⬛⬛⬛⬛⬛
  ⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛ 3/20
  ```
- **⚔️ Vyzvat kamaráda** — samostatné CTA s vlastním textem („Já jsem na dni 12/100 —
  překonáš mě?"). Výzva funguje i pro toho, kdo prohrál.
- `navigator.share` na mobilu (nativní share sheet), fallback do schránky.
- OG metatagy pro náhledy odkazů.

### Roadmapa virality (potřebuje mini-backend, např. Cloudflare Worker + KV)

1. **„🏆 Top X % hráčů dneška"** ve sdílení — nejsilnější řádek z 18words; potřebuje
   anonymní agregaci výsledků (POST den+skóre, GET percentil).
2. **Globální statistika dne** na výsledkové obrazovce: „Dnešní den 12 zvládlo jen 34 % hráčů."
3. **Souboj přes odkaz**: `?vyzva=<den>` — kamarád hraje stejný den jako ty a porovnáte se.
4. **OG obrázek s mřížkou** generovaný pro sdílený výsledek (worker vrací SVG/PNG).
5. Denní hashtag `#2000slov` + launch na českém X/Facebooku (skupiny slovních her),
   Reddit r/czech.

### Další nápady do zásobníku

- PWA manifest (ikona na ploše, offline hraní).
- Notifikace „🔥 Nepřijdeš o sérii?" (push přes PWA).
- Archiv/statistiky týdne, „týdenní recap" ke sdílení v neděli.
- Lehká obfuskace `words.js` proti podvádění (aktuálně čitelné — pro casual hru OK).
- Monetizace až po trakci: „podpoř hru" / kosmetická témata. Žádné reklamy v MVP.

## 4. Technika

- Čistý HTML/CSS/JS, žádný build, žádné závislosti → GitHub Pages zdarma.
- Stav v `localStorage` (klíč `slov2000_v1`): úroveň, rozehraný pokus, série, statistiky.
- Pokus se ukládá **po každém slově** — refresh stránky nic neresetuje ani neobejde.
- Slovník: OpenSubtitles 2018 frekvenční seznam → filtr: 4–11 písmen, jen česká
  abeceda, validace hunspell `cs_CZ` (vyhodí jména, angličtinu, překlepy), blocklist
  vulgarismů, deduplikace anagramů, top 2000 podle frekvence.
