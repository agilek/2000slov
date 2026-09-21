# Otevřené otázky

Věci, na které čekám odpověď, a co se nedá dodělat bez rozhodnutí.
Poslední aktualizace: 2026-09-21.

> Pravidlo: cokoli, co potřebuje rozhodnutí uživatele, patří sem — hned, jak to
> vyjde najevo. Ne až na konci, ne jen v odpovědi v chatu. Zodpovězené se
> přesouvá dolů do „Rozhodnuto", ať je vidět, proč je něco tak, jak je.

---

## 1. Blokuje to ostatní

### 1.1 Doména + Resend
**Stav:** čeká na tebe.
Bez secretů `RESEND_KEY`, `MAIL_FROM` a `HASH_PEPPER` se nedá přihlásit. Řetězec
důsledků: nikdo nemá přezdívku → **nikdo nemůže přidat význam** → neexistuje
jediný veřejný profil. Celá komunitní část je v produkci mrtvá, i když je
hotová a nasazená.

Postup je v `worker/README.md`, sekce „Účty (magic link) — zapnutí".
`HASH_PEPPER` se po nastavení **nesmí nikdy změnit** — je to sůl pro hash
e-mailu, po změně se nikdo nedostane ke svému účtu.

### 1.2 Má `/api/result` vyžadovat přihlášení?
**Stav:** čeká na rozhodnutí.
Klient si dnes `clientId` tvrdí sám, takže percentily „Top X % hráčů dneška"
umí rozhodit kdokoli s curlem. Navázání na účet to spraví, ale nepřihlášení
(tedy většina hráčů) by percentil neviděli vůbec.

- *Nechat otevřené:* široké pokrytí, ale číslo není důvěryhodné.
- *Vyžadovat účet:* číslo sedí, ale většina lidí přijde o zpětnou vazbu.

Můj názor: nechat otevřené a přestat to prezentovat jako žebříček.

### 1.3 Co má stát v textu o soukromí?
**Stav:** čeká na tebe, text napíšu.
Potřebuju potvrdit dvě věci:
1. Že **smazání účtu významy nemaže** — jen z nich sundá jméno. Tak je to
   naprogramované a člověk to musí vědět **před** potvrzením.
2. Kdo je správce údajů a na jaký kontakt se mají lidi obracet.

Souvisí: `worker/README.md:185` a `worker/schema.sql:3` pořád tvrdí „žádná
osobní data se neukládají". Od zavedení účtů to není pravda (ukládá se hash
e-mailu, přezdívka, hash IP na 24 h).

### 1.4 Kdo prochází nahlášené významy?
**Stav:** čeká na rozhodnutí.
Automatické skrytí při třech nahlášeních funguje, ale **nic neumí skrytí
vrátit** — omylem nahlášený význam jde oživit jen ručně přes
`wrangler d1 execute`. Při nule hráčů to stačí, při stovkách ne.

Otázka: stačí ti ruční SQL, nebo chceš jednoduchý admin pohled?

### 1.5 Mají se významy ukazovat i v denní výzvě?
**Stav:** čeká na rozhodnutí.
Teď je vidí jen ten, kdo hraje trénink. Kdo hraje jen denní výzvu, o funkci
nikdy nezjistí. Dřív jsi zvolil „jen trénink", ale to bylo předtím, než významy
vůbec existovaly — stojí za přehodnocení, aspoň pro výsledkovou obrazovku.

---

## 2. Chybí, ale rozhodnutí nepotřebuju

Můžu udělat, až řekneš.

- **Text o soukromí + přepínač „skrýt profil"** — poslední kus P5. Sloupec
  `users.hide_profile` v databázi je, UI k němu ne.
- **Oprava nepravdivých tvrzení** v `worker/README.md:185` a `worker/schema.sql:3`.
- **Série v tréninku se nikde nezobrazuje** — `state.practiceCount` se
  inkrementuje i nuluje a pak s ním nikdo nic nedělá. Mrtvý stav, levná výhra.
- **Souboj přes odkaz `?vyzva=<den>`** — v `GAME_DESIGN.md` od začátku, nikdy
  nepostavené.
- **OG obrázek výsledku** — sdílený odkaz na hru nemá náhled (profil `/u/<handle>`
  og tagy má, hra ne).
- **Přepínač světlý/tmavý režim** — CSS háky `data-theme` existují, nic je
  nenastavuje.
- **Významy jdou upravit, ale ne smazat.**
- **Dvě mrtvé větve** `claude/button-haptic-feedback-8kgxkn` a
  `claude/czech-word-game-f2hnia` na originu, dávno zmergované.

---

## 3. Rozhodnuto (ať se k tomu nevracíme)

| Otázka | Rozhodnutí | Proč |
|---|---|---|
| Velikost denní hry | 7300 slov / 365 dní | rok hraní |
| Co určuje dnešní slova | **datum**, ne postup hráče | aby šly výsledky porovnávat |
| Nestihnuté slovo | série se trhá, den se **neopakuje** | Wordle model |
| Přihlášení | magic link + 6místný kód | odkaz z mailu neotevře PWA |
| Avatary | generované z přezdívky | žádný upload, žádná moderace obrázků |
| Hosting | vše z jednoho Workeru | jedna doména → žádné CORS, `HttpOnly` cookie |
| Otevření významů v tréninku | jen **pozastaví** odpočet | hráč se má vrátit do hry |
| Kdo smí psát významy | **jen přihlášený** | anonymní jméno si může vzít kdokoli |
| Přesmyčky | uznávají se **jen v tréninku** | denní výzva je soutěž |
| Úprava významu | smaže hlasy, pokud nějaké byly | jinak jde vyhlasovat jeden text a nahradit ho jiným |
| Ukládání e-mailu | jen `sha256(adresa + pepř)` | cena: hráčům nejde nic poslat mimo přihlášení |
| Veřejný profil | HTML z workeru, ne SPA | kvůli náhledu při sdílení |
| Název hry | **20 slov** (2026-09-21) | přejmenováno jen v textech pro hráče; identifikátory (`slov2000`, `slov2000_v2`, repo, workers.dev URL) zůstaly — změna by znamenala nový worker a ztrátu postupu všech hráčů |
