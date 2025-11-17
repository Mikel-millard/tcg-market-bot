// src/scripts/snapshot.js
import "dotenv/config";
import db from "../data/database.js";
import { fetchRiftboundCards } from "../tcg/tcgClient.js";

async function runSnapshot() {
    console.log("📥 Starting snapshot from JustTCG...");
    const snapshotDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const insertCard = db.prepare(`
        INSERT OR REPLACE INTO cards (product_id, name, set_name)
    VALUES (?, ?, ?)
    `);

    const insertSnapshot = db.prepare(`
        INSERT INTO price_snapshots (product_id, snapshot_date, market_price)
        VALUES (?, ?, ?)
    `);

    const cards = await fetchRiftboundCards();

    let count = 0;

    for (const card of cards) {
        const variants = card.variants || [];

        const chosenVariant =
            variants.find(
                (v) =>
                    (v.condition === "Near Mint" || v.condition === "NM") &&
                    (v.printing === "Normal" || v.printing === "Non-Foil")
            ) ||
            variants[0];

        if (!chosenVariant || chosenVariant.price == null) continue;

        const productId = card.id;
        const name = card.name || "Unknown";
        const setName = card.set_name || card.set || null;

        insertCard.run(productId, name, setName);
        insertSnapshot.run(productId, snapshotDate, chosenVariant.price);
        count++;
    }

    console.log(`✅ Snapshot complete for ${snapshotDate}. Stored ${count} prices.`);
}

runSnapshot().catch((err) => {
    console.error("Snapshot failed:", err.response?.data || err);
    process.exit(1);
});
