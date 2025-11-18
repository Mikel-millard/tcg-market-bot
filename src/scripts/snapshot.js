import "dotenv/config";
import db from "./database.js";

// JustTCG API config
const JUSTTCG_API_KEY = process.env.JUSTTCG_API_KEY;
if (!JUSTTCG_API_KEY) {
    console.error("Missing JUSTTCG_API_KEY in environment.");
    process.exit(1);
}

// Game + query parameters
const GAME = "riftbound-league-of-legends-trading-card-game";
const BASE_URL = "https://api.justtcg.com/cards"; // Use the same endpoint you already use
const PAGE_LIMIT = 20; // JustTCG free tier max per request is 20
const CONDITION = "Near Mint"; // filter to NM
// optional dev limiter: SNAPSHOT_MAX_BATCHES=5 (for example)
const MAX_BATCHES = process.env.SNAPSHOT_MAX_BATCHES
    ? Number(process.env.SNAPSHOT_MAX_BATCHES)
    : Infinity;

/**
 * Fetch a single page of card pricing data from JustTCG.
 * Adjust the URL/params to match what you already had working.
 */
async function fetchPage(offset) {
    const url = new URL(BASE_URL);

    url.searchParams.set("game", GAME);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("condition", CONDITION);
    // If you were previously using includePriceHistory or similar, add here:
    // url.searchParams.set("includePriceHistory", "true");

    const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
            Authorization: `Bearer ${JUSTTCG_API_KEY}`,
            Accept: "application/json"
        }
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(
            `JustTCG request failed: ${res.status} ${res.statusText} - ${text}`
        );
    }

    const json = await res.json();
    return json;
}

/**
 * Normalize the API response into rows for:
 * - cards table
 * - price_snapshots table
 */
function normalizePage(json) {
    const { data = [], meta = {} } = json;
    const rows = [];

    for (const card of data) {
        const productId = card.id; // string id from JustTCG
        const name = card.name || null;
        const setName = card.set_name || null;
        const rarity = card.rarity || null;

        if (!Array.isArray(card.variants)) continue;

        for (const variant of card.variants) {
            // We already filtered condition at the API level (condition=Near Mint),
            // but if you want to be extra safe:
            if (variant.condition && variant.condition !== "Near Mint") continue;

            const printing = variant.printing || "Non-Foil";
            const price = typeof variant.price === "number" ? variant.price : null;
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

    const { total = 0, limit = PAGE_LIMIT, offset = 0, hasMore = false } = meta;
    return { rows, total, limit, offset, hasMore };
}

/**
 * Write snapshot rows to the database.
 * This version:
 *   - deletes ALL existing rows from price_snapshots
 *   - inserts the new snapshot rows
 *
 * cards table is upserted (static metadata).
 */
function writeSnapshotToDb(allRows, snapshotDate) {
    console.log(
        `[db] Writing snapshot for ${snapshotDate}, ${allRows.length} rows...`
    );

    const deleteSnapshotsStmt = db.prepare("DELETE FROM price_snapshots");

    const insertCardStmt = db.prepare(`
    INSERT OR IGNORE INTO cards (
      product_id,
      name,
      set_name,
      rarity
    ) VALUES (?, ?, ?, ?)
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
        // Wipe all previous snapshot data
        deleteSnapshotsStmt.run();

        for (const row of rows) {
            insertCardStmt.run(
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
 * - pages through all cards from JustTCG
 * - normalizes rows
 * - deletes & rewrites price_snapshots
 */
async function main() {
    try {
        const snapshotDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        console.log(`[snapshot] Starting snapshot for ${snapshotDate}...`);

        let offset = 0;
        let hasMore = true;
        let batchCount = 0;
        const allRows = [];

        while (hasMore && batchCount < MAX_BATCHES) {
            console.log(
                `[snapshot] Fetching page with offset=${offset}, limit=${PAGE_LIMIT}...`
            );
            const json = await fetchPage(offset);
            const { rows, total, limit, offset: newOffset, hasMore: apiHasMore } =
                normalizePage(json);

            console.log(
                `[snapshot] Page ${batchCount + 1}: got ${rows.length} rows (total=${total}, newOffset=${newOffset}, hasMore=${apiHasMore})`
            );

            allRows.push(...rows);

            batchCount += 1;
            hasMore = apiHasMore;

            // move to next page by incrementing offset by limit
            offset = newOffset + limit;

            if (!hasMore) {
                console.log("[snapshot] API reports no more pages.");
            }

            if (batchCount >= MAX_BATCHES && MAX_BATCHES !== Infinity) {
                console.log(
                    `[snapshot] Reached SNAPSHOT_MAX_BATCHES=${MAX_BATCHES}, stopping early (dev mode).`
                );
            }
        }

        console.log(
            `[snapshot] Finished fetching. Total normalized rows: ${allRows.length}`
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