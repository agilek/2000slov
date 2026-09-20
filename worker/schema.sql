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
