import "dotenv/config";
import db from "../data/database.js";
import { fetchRiftboundCards } from "../tcg/tcgClient.js";

/**
 * Normalize the array of cards returned by fetchRiftboundCards()
 * into rows for:
 *  - cards table (metadata)
 *  - price_snapshots table (pricing for a single snapshot_date)
 */
function normalizeCards(cards) {
    const rows = [];

    for (const card of cards) {
        const productId = card.id; // JustTCG product ID
        const name = card.name || null;
        const setName = card.set_name || null;
        const rarity = card.rarity || null;

        if (!Array.isArray(card.variants)) continue;

        for (const variant of card.variants) {
            // We already ask for condition=Near Mint in tcgClient,
            // but if you want to double-check, you could do:
            // if (variant.condition && variant.condition !== "Near Mint") continue;

            const printing = variant.printing || "Non-Foil";
            const price =
                typeof variant.price === "number" ? variant.price : null;
            const change24h =
                typeof variant.priceChange24hr === "number"
                    ? variant.priceChange24hr
                    : null;
            const change7d =
                typeof variant.priceChange7d === "number"
                    ? variant.priceChange7d
                    : null;

            rows.push({
                productId,
                name,
                setName,
                rarity,
                printing,
                marketPrice: price,
                change24h,
                change7d
            });
        }
    }

    return rows;
}

/**
 * Write a single snapshot into the database:
 *  - DELETE all existing rows from price_snapshots
 *  - UPSERT card metadata into cards
 *  - INSERT new snapshot rows with snapshot_date
 */
function writeSnapshotToDb(allRows, snapshotDate) {
    console.log(
        `[db] Writing snapshot for ${snapshotDate}, ${allRows.length} rows...`
    );

    const deleteSnapshotsStmt = db.prepare("DELETE FROM price_snapshots");

    const upsertCardStmt = db.prepare(`
    INSERT INTO cards (
      product_id,
      name,
      set_name,
      rarity
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET
      name = excluded.name,
      set_name = excluded.set_name,
      rarity = excluded.rarity
  `);

    const insertSnapshotStmt = db.prepare(`
    INSERT INTO price_snapshots (
      snapshot_date,
      product_id,
      market_price,
      price_change_24h,
      price_change_7d,
      printing
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

    const tx = db.transaction((rows) => {
        // Wipe previous snapshot data
        deleteSnapshotsStmt.run();

        for (const row of rows) {
            upsertCardStmt.run(
                row.productId,
                row.name,
                row.setName,
                row.rarity
            );

            insertSnapshotStmt.run(
                snapshotDate,
                row.productId,
                row.marketPrice,
                row.change24h,
                row.change7d,
                row.printing
            );
        }
    });

    tx(allRows);

    console.log("[db] Snapshot write completed.");
}

/**
 * Main snapshot runner:
 *  - uses fetchRiftboundCards() from tcgClient.js
 *  - normalizes the data
 *  - rewrites price_snapshots in a single transaction
 */
async function main() {
    try {
        const snapshotDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        console.log(`[snapshot] Starting snapshot for ${snapshotDate}...`);

        console.log("[snapshot] Fetching Riftbound cards from JustTCG...");
        const cards = await fetchRiftboundCards();
        console.log(
            `[snapshot] Fetched ${cards.length} cards from JustTCG (before variant flatten).`
        );

        const allRows = normalizeCards(cards);
        console.log(
            `[snapshot] Normalized to ${allRows.length} variant rows for snapshot.`
        );

        writeSnapshotToDb(allRows, snapshotDate);

        console.log("[snapshot] All done, exiting.");
        process.exit(0);
    } catch (err) {
        console.error("[snapshot] ERROR:", err);
        process.exit(1);
    }
}

main();