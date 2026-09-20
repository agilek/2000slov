# Backend pro skutečné percentily

Malý Cloudflare Worker + D1 databáze, který hře dodává **skutečné** „Top X %
hráčů dneška" místo statického odhadu. Zdarma v rámci free tier Cloudflare
(Workers i D1 mají štědré denní limity, na tuhle hru bohatě stačí).

Dokud tenhle worker nenasadíš, hra funguje úplně normálně — jen ukazuje
statický odhad z `getPercentileText()` v `game.js`. Nasazení je čistě
volitelné vylepšení, nic se tím nerozbije.

## Jak to funguje

- Po dohrání dne pošle hra `POST /api/result` s (den, skóre, anonymní ID
  prohlížeče). Worker si to uloží a hned vrátí percentil.
- Dokud den nemá aspoň **15 odeslaných výsledků**, vrátí se `{ real: false }`
  a hra tiše zůstane u statického odhadu — aby noví hráči neviděli
  směšné „Top 100 % (1 z 1 hráčů)".
- Percentil se v UI dopíše **na pozadí**, bez čekání — výsledková obrazovka
  se zobrazí okamžitě jako dřív, číslo se jen tiše upřesní, jakmile dorazí
  odpověď (do ~1,5 s, jinak se to tiše vzdá a zůstane statický odhad).
- Anonymní ID je náhodné UUID uložené v `localStorage`, nikde se neváže
  na e-mail, jméno ani IP adresu.

## Nasazení (jednorázově)

Potřebuješ Cloudflare účet (zdarma) a Node.js.

```bash
cd worker
npx wrangler login          # otevře prohlížeč, přihlas se/založ účet

npx wrangler d1 create slov2000
# výstup obsahuje "database_id" — zkopíruj ho do wrangler.toml
# (nahraď REPLACE_ME v sekci [[d1_databases]])

npx wrangler d1 execute slov2000 --remote --file=schema.sql

npx wrangler deploy
# na konci vypíše URL tvého workeru, něco jako:
# https://slov2000-api.TVUJ-SUBDOMAIN.workers.dev
```

Pak v `game.js` (kořen repa, ne tahle složka) nastav:

```js
const API_BASE = 'https://slov2000-api.TVUJ-SUBDOMAIN.workers.dev';
```

Commitni a pushni — GitHub Pages nasadí zbytek automaticky.

## Pokud hra běží na jiné doméně

`ALLOWED_ORIGINS` v `src/index.js` má natvrdo `https://agilek.github.io`
(a `localhost:8000` pro lokální vývoj). Pokud přesuneš hru jinam, přidej
novou doménu do téhle množiny a znovu `npx wrangler deploy`.

## Lokální testování bez nasazení

```bash
cd worker
npx wrangler d1 execute slov2000 --local --file=schema.sql
npx wrangler dev --local --port 8787
```

Worker poběží na `http://localhost:8787` s lokální (dočasnou) databází.
V `game.js` dočasně nastav `API_BASE = 'http://localhost:8787'` a hru
spusť přes `python3 -m http.server 8000` (port 8000 je v CORS povolený).

## Denní připomínka (Web Push)

Po dohrání dne hra na iOS nabídne přidání na plochu (Web Push na iOS
funguje jen jako nainstalovaná PWA, od iOS 16.4), na Androidu/desktopu
rovnou nabídne zapnutí notifikací. Odběr se pošle na `POST /api/subscribe`
a uloží do tabulky `subscriptions`. Cron trigger (`[triggers]` ve
`wrangler.toml`, běží denně v 7:00 UTC) pak každému odběrateli pošle
"Dnešní slovo na tebe čeká!" přes `@pushforge/builder` — jediná knihovna
z tohohle výběru, co posílá Web Push čistě přes Web Crypto API, takže
funguje i ve Workers (klasický `web-push` balík potřebuje Node `crypto`/
`https` a ve Workers neběží).

Nasazení navíc oproti krokům výše:

```bash
cd worker
npm install                          # stáhne @pushforge/builder

npx wrangler d1 execute slov2000 --remote --file=schema.sql
# (znovu — přidává tabulku subscriptions; je idempotentní, results nesáhne)

npx @pushforge/builder vapid
# vypíše "Public Key" a "Private Key (JWK)" — ulož obě, nikam je needituj do repa

npx wrangler secret put VAPID_PRIVATE_JWK
# vlož CELÝ JSON z "Private Key (JWK)" jako jeden řádek

npx wrangler deploy
```

Veřejný klíč ("Public Key") vlož do `game.js` (kořen repa) jako
`VAPID_PUBLIC_KEY`. Bez nastaveného `VAPID_PRIVATE_JWK` secretu cron
notifikace prostě selžou (worker to nijak nerozbije, `/api/result` a
`/api/percentile` jedou dál) — je to čistě volitelné vylepšení stejně
jako percentily výš.

## Údržba

- **Přehled dat**: `npx wrangler d1 execute slov2000 --remote --command "SELECT day, COUNT(*) FROM results GROUP BY day ORDER BY day"`
- **Smazání starých dat** (nikdy potřeba, tabulka je maličká i při tisících hráčích): `DELETE FROM results WHERE updated_at < ...`
- Žádná osobní data se neukládají — jen den, skóre a náhodné ID, takže GDPR
  zátěž je minimální (ale pokud to bude řešit produkčně, přidej do hry
  zmínku v „O aplikaci" a možnost si své ID/výsledky nechat smazat).
