// src/data/database.js
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// store DB in project root
const dbPath = path.join(__dirname, "..", "..", "riftbound.db");
const db = new Database(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS cards (
    product_id INTEGER PRIMARY KEY,
    name TEXT,
    set_name TEXT
  );

  CREATE TABLE IF NOT EXISTS price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    snapshot_date TEXT NOT NULL, -- YYYY-MM-DD
    market_price REAL,
    FOREIGN KEY(product_id) REFERENCES cards(product_id)
  );
`);

export default db;
