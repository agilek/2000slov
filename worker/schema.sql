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
