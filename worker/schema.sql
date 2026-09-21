-- Skutečné percentily pro "Top X % hráčů dneška".
-- Jeden řádek = jeden výsledek jednoho hráče pro daný den hry (0-1000, ne kalendářní datum).
-- clientId je náhodné anonymní UUID vygenerované v prohlížeči, žádná osobní data.
CREATE TABLE IF NOT EXISTS results (
  day INTEGER NOT NULL,
  score INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (day, client_id)
);

CREATE INDEX IF NOT EXISTS idx_results_day ON results(day);

-- Web Push odběry pro denní připomínku ("zítra tě čeká další den").
-- Jeden řádek na zařízení (client_id), přepisuje se při novém subscribe.
CREATE TABLE IF NOT EXISTS subscriptions (
  client_id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Komunitní významy slov. Autorství zatím drží anonymní client_id (stejné,
-- jaké používají results) — účty přijdou později a client_id se na ně naváže.
CREATE TABLE IF NOT EXISTS definitions (
  id         TEXT PRIMARY KEY,
  word       TEXT NOT NULL,
  text       TEXT NOT NULL,          -- 10–200 znaků
  client_id  TEXT NOT NULL,
  user_id    TEXT,                   -- vyplní se po přihlášení; dokud není, platí client_id
  author     TEXT,                   -- přezdívka, kterou si hráč zvolil
  votes      INTEGER NOT NULL DEFAULT 0,
  reports    INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
-- Jeden význam na slovo a hráče: hlavní brzda proti zahlcení.
CREATE UNIQUE INDEX IF NOT EXISTS idx_defs_client_word ON definitions(client_id, word);
CREATE        INDEX IF NOT EXISTS idx_defs_word        ON definitions(word, hidden, votes DESC);
CREATE        INDEX IF NOT EXISTS idx_defs_client_time ON definitions(client_id, created_at);

CREATE TABLE IF NOT EXISTS votes (
  definition_id TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (definition_id, client_id)
);

CREATE TABLE IF NOT EXISTS reports (
  definition_id TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (definition_id, client_id)
);

-- Účty. E-mail se NEUKLÁDÁ v otevřené podobě — jen hash s pepřem; adresa žije
-- v paměti po dobu jednoho odeslání a nikam se nezapíše.
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  handle     TEXT,                   -- zobrazovaná podoba, NULL než si ji hráč zvolí
  handle_lc  TEXT UNIQUE,            -- SQLite bere víc NULL v UNIQUE jako různé
  client_id  TEXT,                   -- anonymní ID, ze kterého se účet vytvořil
  created_at INTEGER NOT NULL,
  banned     INTEGER NOT NULL DEFAULT 0,
  hide_profile INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,       -- sha256(cookie); únik DB != únik session
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Jedna žádost o přihlášení. id je zároveň tajemství pro poll, nikam jinam se
-- neposílá. Odkaz session nevytváří, jen ji schválí — vyzvedne si ji ta
-- instance aplikace, která o přihlášení požádala (instalovaná PWA má na iOS
-- vlastní úložiště cookies oddělené od Safari).
CREATE TABLE IF NOT EXISTS login_requests (
  id           TEXT PRIMARY KEY,
  email_hash   TEXT NOT NULL,
  approve_hash TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  ip_hash      TEXT NOT NULL,
  client_id    TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  approved_at  INTEGER,
  consumed_at  INTEGER,
  attempts     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_login_email   ON login_requests(email_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_login_ip      ON login_requests(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_login_approve ON login_requests(approve_hash);

-- Veřejný profil: klíčováno SKUTEČNÝM datem, ne indexem dne. Index se po roce
-- opakuje, takže by druhý rok kolidoval sám se sebou.
CREATE TABLE IF NOT EXISTS profile_days (
  user_id    TEXT NOT NULL,
  played_on  TEXT NOT NULL,          -- 'YYYY-MM-DD', lokální datum hráče
  day_idx    INTEGER NOT NULL,       -- 0–364
  score      INTEGER NOT NULL,       -- 0–20
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, played_on)
);
CREATE INDEX IF NOT EXISTS idx_profile_user ON profile_days(user_id, played_on DESC);
