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

## Údržba

- **Přehled dat**: `npx wrangler d1 execute slov2000 --remote --command "SELECT day, COUNT(*) FROM results GROUP BY day ORDER BY day"`
- **Smazání starých dat** (nikdy potřeba, tabulka je maličká i při tisících hráčích): `DELETE FROM results WHERE updated_at < ...`
- Žádná osobní data se neukládají — jen den, skóre a náhodné ID, takže GDPR
  zátěž je minimální (ale pokud to bude řešit produkčně, přidej do hry
  zmínku v „O aplikaci" a možnost si své ID/výsledky nechat smazat).
