import axios from "axios";
import "dotenv/config";

const JUSTTCG_API_KEY = process.env.JUSTTCG_API_KEY;
const BASE_URL = "https://api.justtcg.com/v1";

const RIFTBOUND_GAME_ID = "riftbound-league-of-legends-trading-card-game";

// Dev-mode snapshot limiting: how many batches to fetch max.
// Default is a huge number so prod/full runs are unaffected.
const SNAPSHOT_MAX_BATCHES = Number.parseInt(
    process.env.SNAPSHOT_MAX_BATCHES || "999",
    10
);

if (!JUSTTCG_API_KEY) {
    console.warn("⚠ JUSTTCG_API_KEY is not set in .env");
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch all (or some) Riftbound NM singles using offset pagination.
 * - limit = 20 (free plan)
 * - offset = 0, 20, 40, ...
 * - stops when API says there are no more results OR SNAPSHOT_MAX_BATCHES reached
 */
export async function fetchRiftboundCards() {
    const allCards = [];
    const limit = 20;
    let offset = 0;
    let batch = 1;

    while (true) {
        if (batch > SNAPSHOT_MAX_BATCHES) {
            console.warn(
                `⚠ SNAPSHOT_MAX_BATCHES (${SNAPSHOT_MAX_BATCHES}) reached — stopping early (dev mode).`
            );
            break;
        }

        console.log(`\n=== Fetching batch ${batch} (offset=${offset}) ===`);

        const resp = await axios.get(`${BASE_URL}/cards`, {
            headers: { "x-api-key": JUSTTCG_API_KEY },
            params: {
                game: RIFTBOUND_GAME_ID,
                limit,
                offset,
                condition: "Near Mint", // or "NM" depending on what you've verified
                // If the API supports a sealed flag, keep this; otherwise remove it:
                sealed: false,
                include: "variants"
            }
        });

        const data = resp.data?.data || [];
        const meta = resp.data?.meta || {};
        const count = data.length;

        if (count > 0) {
            console.log("Sample cards:");
            data.slice(0, 3).forEach((c) => {
                console.log(`  - ${c.name} (id: ${c.id})`);
            });
        }

        allCards.push(...data);
        console.log(`  -> got ${count} items`);
        console.log(`  -> total so far: ${allCards.length}`);

        const hasMore = meta.hasMore === true;

        if (!hasMore || count === 0) {
            console.log("Reached final batch (no more results).");
            break;
        }

        offset += limit;
        batch++;

        // Respect 10 req/min on free tier
        await sleep(6500);
    }

    console.log(
        `\nDone. Total Riftbound NM singles fetched in this run: ${allCards.length}`
    );
    return allCards;
}