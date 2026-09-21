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

Všechno se pouští **z kořene repa** — `wrangler.toml` je tam, ne v téhle složce,
protože jeden Worker servíruje statiku (`public/`) i API.

```bash
npx wrangler login          # otevře prohlížeč, přihlas se/založ účet

npx wrangler d1 create slov2000
# výstup obsahuje "database_id" — zkopíruj ho do wrangler.toml

npx wrangler d1 execute slov2000 --remote --file=worker/schema.sql

npx wrangler deploy
# vypíše URL, na které běží hra i API dohromady
```

`API_BASE` v `public/game.js` je **prázdný řetězec** a nesahá se na něj:
API je na stejné doméně jako hra, takže stačí relativní cesty.

## Žádné CORS

Hra i API mají jeden origin, takže se CORS neřeší vůbec — v kódu nejsou
`Access-Control-*` hlavičky ani větev `OPTIONS`. Zápisy jsou proti CSRF
chráněné dvakrát: hlavička `Origin` musí sedět na vlastní doménu
(`sameOrigin()` v `src/index.js`) a cizí stránka neumí poslat
`Content-Type: application/json` bez preflightu, který bez CORS hlaviček neprojde.

Kdyby někdy bylo potřeba volat API z jiné domény, je to vědomá změna:
CORS se musí přidat zpátky.

## Významy slov

`/api/defs*` drží komunitní významy (tabulky `definitions`, `votes`, `reports`).
Dvě věci, které se z kódu nevyčtou:

- **Validace je ve `src/validate.js`, ne v `index.js`** — a je to schválně.
  Cloudflare kontroluje každý pojmenovaný export vstupního modulu jako handler,
  takže `export const DEF_MAX` tam runtime shodí hláškou
  „not of type 'function or ExportedHandler'". Vlastní modul jde importovat
  z workeru i z `test.mjs`.
- **Edge cache se klíčuje po jednotlivých slovech**, ne po dávce (fronty jsou
  u každého hráče jiné, klíč podle dávky by se netrefil). Klíč se staví ručně
  z `https://cache.local/def/<slovo>` — nikdy z příchozího requestu, ten nese
  cookie a `clientId`. Příznak `mine` je na hráče, a proto se dopočítává až
  po cache. Purge je per-kolo, takže jiný region může mít až 300 s starou
  odpověď; u hobby hry přijatelné.

## Účty (magic link) — zapnutí

Kód je hotový a nasazený, ale **spí**, dokud nejsou secrety. Do té doby vrací
`/api/me` `auth:false`, `/api/auth/start` končí na 503 a aplikace sekci účtu
vůbec neukáže — hra jede anonymně dál. Zapnutí je tohle, nic v kódu se nemění:

```bash
# 1) doména v Cloudflare + Custom Domain na workeru slov2000
# 2) v Resendu ověřit doménu (SPF + DKIM záznamy, které Resend vypíše)
npx wrangler secret put RESEND_KEY     # API klíč z Resendu
npx wrangler secret put MAIL_FROM      # např. "2000 slov <hra@tvojedomena.cz>"
npx wrangler secret put HASH_PEPPER    # dlouhý náhodný řetězec, už NIKDY neměnit
npx wrangler deploy
```

`HASH_PEPPER` je sůl pro hash e-mailu. **Když se změní, nikdo se nepřihlásí
ke svému starému účtu** — hash adresy přestane sedět. Vygeneruj jednou
(`openssl rand -hex 32`) a ulož mimo repo.

Proč se odkaz jen *schvaluje* a session si vyzvedne poll: odkaz z mailu otevře
Safari/Chrome, ne nainstalovanou PWA, a ta má na iOS 17.4+ vlastní úložiště
cookies. Cookie nastavená klikem v mailu se do aplikace nedostane nikdy.
Schválení je navíc `POST` za tlačítkem, protože poštovní skenery odkazy
předběžně stahují a `GET` by tiše přihlásil cizího člověka.

E-mail se **neukládá** — v DB je jen `sha256(adresa + HASH_PEPPER)`. Adresa žije
v paměti po dobu jednoho odeslání. Důsledek: hráčům nejde nic poslat mimo
přihlašovací e-mail (žádná oznámení, žádná hromadná zpráva).

### Lokální vyzkoušení bez skutečného odesílání

`RESEND_URL` přesměruje odchozí poštu na vlastní mock (jen pro vývoj, v produkci
se nenastavuje). Do `.dev.vars` v kořeni repa:

```
RESEND_KEY=test
MAIL_FROM=hra@example.com
RESEND_URL=http://localhost:9099/emails
HASH_PEPPER=local-dev-pepper
```

Mock, který odchycený e-mail uloží do souboru, stačí na pár řádků v Node.
Odkaz i kód se pak vyčtou z jeho těla.

> **Pozor:** `.dev.vars` patří vedle `wrangler.toml`, tedy do **kořene repa**,
> ne do `worker/`. Po přesunu konfigurace do kořene se soubor ve `worker/`
> přestal načítat (a tiše zmizel i VAPID klíč pro lokální vývoj).

## Lokální testování bez nasazení

```bash
npx wrangler d1 execute slov2000 --local --file=worker/schema.sql
npx wrangler dev --port 8787
```

Na `http://localhost:8787` poběží hra i API proti lokální (dočasné) databázi.
Žádný druhý server ani úprava `API_BASE` není potřeba.

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
(cd worker && npm install)           # stáhne @pushforge/builder

npx wrangler d1 execute slov2000 --remote --file=worker/schema.sql
# (znovu — přidává tabulku subscriptions; je idempotentní, results nesáhne)

npx @pushforge/builder vapid
# vypíše "Public Key" a "Private Key (JWK)" — ulož obě, nikam je needituj do repa

npx wrangler secret put VAPID_PRIVATE_JWK
# vlož CELÝ JSON z "Private Key (JWK)" jako jeden řádek

npx wrangler deploy
```

Veřejný klíč ("Public Key") vlož do `public/game.js` jako
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
