// src/tcg/tcgClient.js
import axios from "axios";
import "dotenv/config";

const JUSTTCG_API_KEY = process.env.JUSTTCG_API_KEY;
const BASE_URL = "https://api.justtcg.com/v1";

const RIFTBOUND_GAME_ID = "riftbound-league-of-legends-trading-card-game";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchRiftboundCards() {
    const allCards = [];
    const limit = 20;
    let offset = 0;
    let batch = 1;

    const MAX_BATCHES = 500; // safety limit

    while (true) {
        console.log(`\n=== Fetching batch ${batch} (offset=${offset}) ===`);

        const resp = await axios.get(`${BASE_URL}/cards`, {
            headers: { "x-api-key": JUSTTCG_API_KEY },
            params: {
                game: RIFTBOUND_GAME_ID,
                limit,
                offset,
                include: "variants"
                // add condition + sealed filters here if supported
            }
        });

        const cards = resp.data.data || [];
        const count = cards.length;

        if (count > 0) {
            console.log("Sample items:");
            cards.slice(0, 3).forEach(c => {
                console.log(`  - ${c.name} (id: ${c.id})`);
            });
        }

        allCards.push(...cards);
        console.log(`  -> got ${count} items`);
        console.log(`  -> total so far: ${allCards.length}`);

        // Normal exit condition:
        if (count < limit) {
            console.log("Reached final batch (fewer than limit).");
            break;
        }

        // Increase offset
        offset += limit;
        batch++;

        // Safety
        if (batch > MAX_BATCHES) {
            console.warn("⚠ MAX_BATCHES reached — stopping early.");
            break;
        }

        // Respect 10 requests/min
        await sleep(6500);
    }

    console.log(`\nDone. Total Riftbound items fetched: ${allCards.length}`);
    return allCards;
}
