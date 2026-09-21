#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vygeneruje words.js — slovník pro 2000 slov.

    pip install wordfreq
    python3 tools/build_words.py            # ze zdrojů, stahuje z internetu
    python3 tools/build_words.py --cache …  # znovu z už stažených dat

Postup (podrobně v README.md, sekce „Slovní zásoba"):
 1. Základ = tools/vetted_pool.txt: 13 000 ručně prověřených substantiv
    seřazených podle OpenSubtitles 2018 (index v souboru = pořadí v korpusu).
    Automaticky se zrekonstruovat NEDÁ — obsahuje kurátorská rozhodnutí,
    která z kategorií Wikislovníku nevyčteš: `stát`/`moc`/`škoda`/`kus` mají
    zůstat (fungují jako podstatná jména), `měl` (tvar slovesa *mít*) ne,
    i když v kategorii substantiv formálně je. Proto je pool v repu jako data.
 2. Stáhne Kategorie:Česká substantiva z cs.wiktionary.org (MediaWiki API)
    + kategorie ostatních slovních druhů, a doplní pool o slova, která v něm
    ještě nejsou: jednoslovná, malými písmeny, délka 3+, bez
    homografů-nesubstantiv, bez vulgarismů, s doloženým výskytem ve wordfreq.
 2b. Morfologický filtr (MorphoDiTa, ÚFAL LINDAT): projde jen slovo, které má
    čtení jako obecné podstatné jméno v 1. pádě (nebo nesklonné) a nemá pod vlastním
    lemmatem čtení jako přídavné jméno, zájmeno, číslovka, spojka, předložka,
    částice ani citoslovce. Kategorie Wikislovníku na to nestačí — heslo je
    v Kategorii:Česká substantiva, i když je jmenný význam okrajový (`starý`,
    `psí`, `měl`). Zbytek řeší ručně tools/pos_overrides.txt.
 3. Pořadí = průměr dvou frekvenčních pořadí: OpenSubtitles 2018 cs_full
    (mluvený jazyk) a wordfreq cs (Wikipedie, zpravodajství, web, titulky).
    Slovo musí být běžné v obou — tím padají homografy, na kterých jeden
    zdroj přestřelí (`plzeň` = město, `osle` = vokativ).
 4. PRACTICE_WORDS = 15 000 nejběžnějších (trénink).
 5. WORDS = 7300 nejběžnějších (denní výzva, 365 dní) rozdělených do
    20 frekvenčních pásem po 365; každý den dostane právě jedno slovo
    z každého pásma → všechny dny mají srovnatelnou obtížnost.
 6. Kontrola tematických shluků uvnitř dne + oprava prohozením v pásmu.

ALTS (mapa uznávaných přesmyček) se přebírá ze stávajícího words.js — původní
kurace se nepodařilo zrekonstruovat (viz DEVLOG 2026-09-21) — a navíc se doplní
o přesmyčky uvnitř poolu: když jde ze stejných písmen složit jiné slovo, které
hra sama zná, musí ho uznat taky.
"""
import argparse, base64, collections, json, os, random, re, sys, time
import urllib.parse, urllib.request

API = "https://cs.wiktionary.org/w/api.php"
MORPHODITA = "https://lindat.mff.cuni.cz/services/morphodita/api/analyze"
UA = {"User-Agent": "2000slov-vocab/1.0 (+https://github.com/agilek/2000slov)"}

DAYS, PER_DAY = 365, 20
POOL_SIZE, DAILY_SIZE = 15000, DAYS * PER_DAY
SEED = 20260921

# Denní slova se do words.js zapisují zamíchaná (viz DECODER dole), aby si
# zvědavý hráč nepřečetl zítřek rovnou ze zdrojáku. Je to obfuskace, ne
# šifrování — klíč je v balíčku. Stejná aritmetika musí běžet v Pythonu i v JS,
# proto se všechno drží v 32bitových bezznaménkových číslech.
SALT = "2000slov"


def _u32(x):
    return x & 0xFFFFFFFF


def _seed_of(idx):
    """FNV-1a nad SALT+idx — z čísla dne udělá rozházený startovní stav."""
    h = 0x811C9DC5
    for b in (SALT + str(idx)).encode("utf-8"):
        h = _u32((h ^ b) * 0x01000193)
    return h


def _keystream(seed, n):
    """mulberry32 — proudová šifra po 4 bajtech."""
    a, out = seed, bytearray()
    while len(out) < n:
        a = _u32(a + 0x6D2B79F5)
        t = _u32((a ^ (a >> 15)) * (a | 1))
        t = _u32(_u32(t + _u32((t ^ (t >> 7)) * (t | 61))) ^ t)
        out += _u32(t ^ (t >> 14)).to_bytes(4, "little")
    return out[:n]


def pack_day(words, idx):
    raw = "\n".join(words).encode("utf-8")
    key = _keystream(_seed_of(idx), len(raw))
    return base64.b64encode(bytes(a ^ b for a, b in zip(raw, key))).decode()


# Protějšek pack_day v prohlížeči. Mimo f-string, ať se nemusí zdvojovat {}.
DECODER = r"""// Denní slova jsou zamíchaná schválně: kdo si otevře zdroják, nemá si
// přečíst zítřek. Klíč je ale tady v souboru — brání to zvědavému pohledu,
// ne odhodlanému člověku. Skutečné utajení by znamenalo servírovat den
// z workeru, čímž by padla hra offline.
const SALT = "2000slov";

function seedOf(idx) {
    let h = 0x811C9DC5;
    for (const b of new TextEncoder().encode(SALT + idx)) h = Math.imul(h ^ b, 0x01000193);
    return h >>> 0;
}

function unpackDay(idx) {
    const bytes = Uint8Array.from(atob(PACKED[idx]), c => c.charCodeAt(0));
    let a = seedOf(idx), key = 0, have = 0;
    for (let i = 0; i < bytes.length; i++) {
        if (have === 0) {
            a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, a | 1);
            t = t + Math.imul(t ^ t >>> 7, t | 61) ^ t;
            key = (t ^ t >>> 14) >>> 0;
            have = 4;
        }
        bytes[i] ^= key & 0xff;
        key >>>= 8;
        have--;
    }
    return new TextDecoder().decode(bytes).split("\n");
}"""

NOUNS = "Kategorie:Česká substantiva"
# slovní druhy, jejichž hesla se do kategorie substantiv dostala jako homografy
NOT_NOUNS = ["Kategorie:Česká příslovce", "Kategorie:České spojky",
             "Kategorie:České předložky", "Kategorie:Česká zájmena",
             "Kategorie:České číslovky", "Kategorie:Česká citoslovce",
             "Kategorie:České částice", "Kategorie:České zkratky"]
VERBS = "Kategorie:Česká slovesa"

CZ = set("aábcčdďeéěfghiíjklmnňoópqrřsštťuúůvwxyýzž")
VULGAR = re.compile(r"(kurv|prdel|hovn|hajzl|píč|čur|čůr|mrd|šuká|šulin|zkurv"
                    r"|sračk|chcank|kokot|debil|zmrd|buzer|sviň|prcá|kunda|kundič)")
# zájmenné tvary, které projdou vším ostatním
BLOCK = {"naši", "vaši", "naše", "vaše", "moje", "tvoje", "jejich", "svoje"}

THEMES = {
    "čas dne": "den noc večer ráno poledne odpoledne dopoledne půlnoc podvečer svítání soumrak úsvit",
    "rodina": "matka otec táta máma syn dcera bratr sestra manžel manželka rodina rodiče babička dědeček teta strýc bratranec sestřenice vnuk vnučka švagr tchán tchyně",
    "dny v týdnu": "pondělí úterý středa čtvrtek pátek sobota neděle týden víkend",
    "roční období": "jaro léto podzim zima měsíc rok století",
    "barvy": "barva bílá černá červená modrá zelená žlutá růžová šedá hnědá fialová oranžová",
    "tělo": "hlava ruka noha oko ucho nos ústa vlasy prst rameno koleno loket záda břicho krk srdce mozek kůže zub jazyk brada čelo",
    "zbraně": "zbraň pistole puška nůž meč revolver brokovnice kulomet granát bomba náboj kudla dýka",
    "emoce": "láska strach radost smutek vztek hněv nenávist štěstí žárlivost lítost stud hrdost",
    "domov": "dům domov byt pokoj kuchyně koupelna ložnice zahrada dveře okno střecha zeď podlaha strop schody",
}
THEME_OF = {w: t for t, ws in THEMES.items() for w in ws.split()}


def cached(cache, name, produce):
    path = os.path.join(cache, name)
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    val = produce()
    os.makedirs(cache, exist_ok=True)
    json.dump(val, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    return val


def morphodita(words, cache, batch=800):
    """Morfologická analýza; každé slovo zvlášť (vertical + prázdný řádek),
    aby tagger nehádal z kontextu vedlejších slov. Dotahuje jen to, co
    v cache ještě není."""
    path = os.path.join(cache, "morphodita.json")
    out = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    todo = [w for w in words if w not in out]
    if todo:
        print(f"  morfologie: dotahuji {len(todo)} slov", file=sys.stderr)
        for i in range(0, len(todo), batch):
            data = "\n\n".join(todo[i:i + batch]) + "\n"
            body = urllib.parse.urlencode({
                "data": data, "output": "json", "guesser": "no",
                "convert_tagset": "strip_lemma_id", "input": "vertical"}).encode()
            for attempt in range(5):
                try:
                    r = json.load(urllib.request.urlopen(
                        urllib.request.Request(MORPHODITA, data=body), timeout=300))
                    break
                except Exception as e:
                    print("  MorphoDiTa retry", attempt, e, file=sys.stderr)
                    time.sleep(3 * (attempt + 1))
            else:
                raise SystemExit("MorphoDiTa je nedostupná")
            for sent in r["result"]:
                for t in sent:
                    out.setdefault(t["token"], []).extend(
                        [a["tag"], a["lemma"]] for a in t["analyses"])
            print(f"  morfologie {min(i + batch, len(todo))}/{len(todo)}", file=sys.stderr)
        # slovo, které analyzátor nezná, si zapamatuj jako prázdné — ať se
        # nedotahuje znovu při každém běhu
        for w in todo:
            out.setdefault(w, [])
        os.makedirs(cache, exist_ok=True)
        json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    return out


def read_overrides(path):
    allow, deny, sec = set(), set(), None
    for line in open(path, encoding="utf-8"):
        line = line.split("#")[0].strip()
        if not line:
            continue
        if line in ("ALLOW", "DENY"):
            sec = line
        else:
            (allow if sec == "ALLOW" else deny).update(line.split())
    assert not (allow & deny), f"slovo je v ALLOW i DENY: {allow & deny}"
    return allow, deny


def category(title):
    out, cont = [], {}
    while True:
        q = {"action": "query", "list": "categorymembers", "cmtitle": title,
             "cmlimit": "500", "cmtype": "page", "format": "json", **cont}
        req = urllib.request.Request(API + "?" + urllib.parse.urlencode(q), headers=UA)
        d = json.load(urllib.request.urlopen(req, timeout=60))
        out += [m["title"] for m in d["query"]["categorymembers"]]
        if "continue" not in d:
            return out
        cont, _ = d["continue"], time.sleep(0.1)



def clashes(day):
    """Shluky uvnitř jednoho dne: stejné téma, nebo stejný slovní kmen."""
    c = collections.Counter(THEME_OF[w] for w in day if w in THEME_OF)
    out = [f"téma {t}" for t, n in c.items() if n > 1]
    s = collections.Counter(w[:5] for w in day if len(w) >= 5)
    return out + [f"kmen {p}" for p, n in s.items() if n > 1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=".wordcache", help="adresář pro stažená data")
    ap.add_argument("--base", default="tools/vetted_pool.txt")
    ap.add_argument("--overrides", default="tools/pos_overrides.txt")
    ap.add_argument("--out", default="public/words.js")
    args = ap.parse_args()
    from wordfreq import zipf_frequency

    nouns = cached(args.cache, "nouns.json", lambda: category(NOUNS))
    not_nouns = set()
    for c in NOT_NOUNS:
        key = "pos_" + c.split(":")[1].replace(" ", "_") + ".json"
        not_nouns |= set(cached(args.cache, key, lambda c=c: category(c)))
    verbs = set(cached(args.cache, "pos_verbs.json", lambda: category(VERBS)))
    print(f"substantiv: {len(nouns)}, nesubstantivních homografů: {len(not_nouns)}")

    def keep(w):
        return (w == w.lower() and len(w) >= 3 and all(ch in CZ for ch in w)
                and w not in not_nouns and not VULGAR.search(w)
                # slovesné infinitivy zatoulané do kategorie substantiv
                and not (w in verbs and w.endswith(("t", "ti"))))

    base = open(args.base, encoding="utf-8").read().split()
    seen = set(base)
    extra = sorted({w for w in nouns if w not in seen and keep(w) and zipf_frequency(w, "cs") > 0})

    # morfologický filtr — jen skutečná podstatná jména
    allow, deny = read_overrides(args.overrides)
    an = morphodita(sorted(set(base) | set(extra)), args.cache)
    missing = [w for w in set(base) | set(extra) if w not in an]
    assert not missing, f"bez morfologické analýzy: {missing[:20]} ({len(missing)})"
    unknown = [w for w in base if not an[w]]
    if unknown:
        print(f"  morfologie nezná {len(unknown)} slov základu: {unknown[:10]}")

    def is_noun(w):
        if w in deny:
            return False
        if w in allow:
            return True
        t = an.get(w, [])
        # 1. pád, nebo nesklonné (madam, zoo, tabu) -> značka má pád "X"
        return (any(tag.startswith("NN") and len(tag) > 4 and tag[4] in "1X" for tag, _ in t)
                # vlastní lemma jako přídavné jméno / zájmeno / číslovka /
                # spojka / předložka / částice / citoslovce -> není to substantivum
                and not any(tag[0] == "A" and lem == w for tag, lem in t)
                and not any(tag[0] in "PCJRTI" and lem == w for tag, lem in t))

    dropped = [w for w in base if not is_noun(w)]
    base = [w for w in base if is_noun(w)]
    extra = [w for w in extra if is_noun(w)]
    extra.sort(key=lambda w: (-zipf_frequency(w, "cs"), w))
    extra = extra[:POOL_SIZE - len(base)]
    print(f"morfologie vyřadila z prověřeného základu: {len(dropped)}"
          f" (např. {dropped[:8]})")
    print(f"prověřený základ: {len(base)}, doplněno: {len(extra)}")

    words = base + extra
    # dvě nezávislá pořadí. OpenSubtitles = pořadí v prověřeném poolu, doplněná
    # slova v tom korpusu frekvenci nemají (proto tam nebyla) → na konec.
    os_rank = {w: i for i, w in enumerate(words)}
    wf_rank = {w: i for i, w in enumerate(sorted(words, key=lambda w: (-zipf_frequency(w, "cs"), os_rank[w])))}
    pool = sorted(words, key=lambda w: ((os_rank[w] + wf_rank[w]) / 2, os_rank[w]))
    assert len(pool) == POOL_SIZE, f"pool má {len(pool)} slov, čekáno {POOL_SIZE}"
    print(f"pool: {len(pool)}  (první: {pool[:8]})")

    daily = [w for w in pool if w not in BLOCK][:DAILY_SIZE]
    rnd = random.Random(SEED)
    bands = [daily[b * DAYS:(b + 1) * DAYS] for b in range(PER_DAY)]
    for b in bands:
        rnd.shuffle(b)
    days = [[b[i] for b in bands] for i in range(DAYS)]
    for d in days:
        rnd.shuffle(d)

    band_of = {w: b for b, ws in enumerate(bands) for w in ws}
    print("dnů se shlukem před opravou:", sum(1 for d in days if clashes(d)))
    for _ in range(50):
        bad = [i for i, d in enumerate(days) if clashes(d)]
        if not bad:
            break
        for i in bad:
            for w in list(days[i]):
                if not clashes(days[i]):
                    break
                for j in rnd.sample(range(DAYS), DAYS):
                    if j == i:
                        continue
                    v = next(x for x in days[j] if band_of[x] == band_of[w])
                    days[i][days[i].index(w)], days[j][days[j].index(v)] = v, w
                    if not clashes(days[i]) and not clashes(days[j]):
                        break
                    days[i][days[i].index(v)], days[j][days[j].index(w)] = w, v
    assert not any(clashes(d) for d in days), "tematické shluky se nepodařilo opravit"

    flat = [w for d in days for w in d]
    assert len(flat) == DAILY_SIZE == len(set(flat)), "slova se rozešla"
    assert all(len({band_of[w] for w in d}) == PER_DAY for d in days), "pásma se rozešla"

    alts = json.loads(re.search(r"^const ALTS = (\{.*\});$",
                                open(args.out, encoding="utf-8").read(), re.M | re.S).group(1))
    # Přesmyčky uvnitř poolu. Kurace z původního slovníku zůstává, tohle ji jen
    # doplňuje — jinak hra označí za chybu slovo, které sama zná a je ze stejných
    # písmen (síla/lísa, nárok/korán/orkán).
    anagrams = {}
    for w in pool:
        anagrams.setdefault("".join(sorted(w)), []).append(w)
    linked = 0
    for group in anagrams.values():
        if len(group) < 2:
            continue
        for w in group:
            have = alts.setdefault(w, [])
            for other in group:
                if other != w and other not in have:
                    have.append(other)
                    linked += 1
    print(f"přesmyček uvnitř poolu doplněno: {linked}")
    alts = json.dumps(alts, ensure_ascii=False, separators=(",", ":"))
    packed = [pack_day(d, i) for i, d in enumerate(days)]
    j = lambda xs: "[" + ",".join('"%s"' % w for w in xs) + "]"
    open(args.out, "w", encoding="utf-8").write(f'''// Denní výzva: {DAILY_SIZE} nejčastějších českých podstatných jmen (Wikislovník,
// Kategorie:Česká substantiva) = {DAYS} dní po {PER_DAY} slovech. Pořadí slov v poolu
// je dáno kombinací dvou frekvenčních zdrojů (OpenSubtitles 2018 cs_full
// + wordfreq cs: Wikipedie, zpravodajství, web, titulky) — průměr obou pořadí,
// takže slovo musí být běžné v mluvě i v psaném jazyce.
// Slova jsou rozdělena do {PER_DAY} frekvenčních pásem po {DAYS} slovech a každý den
// dostane právě jedno slovo z každého pásma, náhodně (seed {SEED}).
// Proto mají všechny dny stejně namíchanou obtížnost a datum — ne postup
// hráče — určuje, která slova se hrají: všichni hrají v daný den to samé.
// Generuje tools/build_words.py — needituj ručně.

{DECODER}

// Jeden zamíchaný blob na den, {PER_DAY} slov v každém. Rozbalí unpackDay(den).
const PACKED = {j(packed)};

// Trénink: širší pool {POOL_SIZE} slov (nadmnožina WORDS) pro volnou hru bez
// omezení na datum — trénink nikdy neomezuje na jen odehraná slova.
const PRACTICE_WORDS = {j(pool)};

const ALTS = {alts};
''')
    print(f"zapsáno {args.out}: PACKED {len(packed)} dnů / {len(flat)} slov, PRACTICE_WORDS {len(pool)}")


if __name__ == "__main__":
    sys.exit(main())
