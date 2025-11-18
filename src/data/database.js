import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "..", "riftbound.db");
const db = new Database(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  -- Card metadata (mostly static)
  CREATE TABLE IF NOT EXISTS cards (
    product_id TEXT PRIMARY KEY,
    name TEXT,
    set_name TEXT,
    rarity TEXT
  );

  -- Latest known market info for each card/variant we track
  CREATE TABLE IF NOT EXISTS price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL, -- YYYY-MM-DD
    market_price REAL,
    price_change_7d REAL,
    price_change_24h REAL,
    printing TEXT,              -- e.g. "Foil", "Normal", "Non-Foil"
    FOREIGN KEY(product_id) REFERENCES cards(product_id)
  );
`);

export default db;