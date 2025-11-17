import "dotenv/config";
import db from "../data/database.js";
import { fetchRiftboundCards } from "../tcg/tcgClient.js";

async function runSnapshot() {
    console.log("📥 Starting snapshot from JustTCG...");
    const snapshotDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const insertCard = db.prepare(`
    INSERT OR REPLACE INTO cards (product_id, name, set_name, rarity)
    VALUES (?, ?, ?, ?)
  `);

    const insertSnapshot = db.prepare(`
    INSERT INTO price_snapshots (
      product_id,
      snapshot_date,
      market_price,
      price_change_7d,
      price_change_24h,
      printing
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

    const cards = await fetchRiftboundCards();

    let count = 0;

    for (const card of cards) {
        const variants = card.variants || [];
        if (variants.length === 0) continue;

        // Extra safety: filter to NM variants in case API doesn't fully enforce condition
        const nmVariants = variants.filter(
            (v) => v.condition === "Near Mint" || v.condition === "NM"
        );
        if (nmVariants.length === 0) continue;

        // Prefer Normal / Non-Foil if present, else any NM variant
        const chosenVariant =
            nmVariants.find(
                (v) => v.printing === "Normal" || v.printing === "Non-Foil"
            ) || nmVariants[0];

        if (!chosenVariant || chosenVariant.price == null) continue;

        const productId = card.id;
        const name = card.name || "Unknown";
        const setName = card.set_name || card.set || null;
        const rarity = card.rarity || null;

        const marketPrice = chosenVariant.price;
        const change7d =
            typeof chosenVariant.priceChange7d === "number"
                ? chosenVariant.priceChange7d
                : null;
        const change24h =
            typeof chosenVariant.priceChange24hr === "number"
                ? chosenVariant.priceChange24hr
                : null;
        const printing = chosenVariant.printing || null; // e.g. "Foil", "Normal"

        insertCard.run(productId, name, setName, rarity);
        insertSnapshot.run(
            productId,
            snapshotDate,
            marketPrice,
            change7d,
            change24h,
            printing
        );

        count++;
    }

    console.log(`✅ Snapshot complete for ${snapshotDate}. Stored ${count} rows.`);
}

runSnapshot().catch((err) => {
    console.error("Snapshot failed:", err.response?.data || err);
    process.exit(1);
});
