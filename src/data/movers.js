import db from "./database.js";

/**
 * Fetch movers for a given window ("24h" or "7d") and optional rarity filter.
 */
export function getMovers(limit = 10, window = "7d", rarityFilter = null) {
    const latestRow = db
        .prepare(
            `SELECT DISTINCT snapshot_date
             FROM price_snapshots
             ORDER BY snapshot_date DESC
                 LIMIT 1`
        )
        .get();

    if (!latestRow) {
        return { increases: [], decreases: [], date: null, window, rarity: rarityFilter };
    }

    const date = latestRow.snapshot_date;
    const column = window === "24h" ? "price_change_24h" : "price_change_7d";

    const rarityClause = rarityFilter ? " AND LOWER(c.rarity) = LOWER(?)" : "";
    const incParams = rarityFilter ? [date, rarityFilter, limit] : [date, limit];
    const decParams = rarityFilter ? [date, rarityFilter, limit] : [date, limit];

    const increases = db
        .prepare(
            `
                SELECT
                    ps.product_id AS productId,
                    c.name AS name,
                    c.set_name AS setName,
                    c.rarity AS rarity,
                    ps.market_price AS price,
                    ps.${column} AS change,
                    ps.printing AS printing
                FROM price_snapshots ps
                         JOIN cards c ON c.product_id = ps.product_id
                WHERE ps.snapshot_date = ?
                  AND ps.${column} IS NOT NULL
                    ${rarityClause}
                ORDER BY ps.${column} DESC
                    LIMIT ?
            `
        )
        .all(...incParams);

    const decreases = db
        .prepare(
            `
                SELECT
                    ps.product_id AS productId,
                    c.name AS name,
                    c.set_name AS setName,
                    c.rarity AS rarity,
                    ps.market_price AS price,
                    ps.${column} AS change,
                    ps.printing AS printing
                FROM price_snapshots ps
                         JOIN cards c ON c.product_id = ps.product_id
                WHERE ps.snapshot_date = ?
                  AND ps.${column} IS NOT NULL
                    ${rarityClause}
                ORDER BY ps.${column} ASC
                    LIMIT ?
            `
        )
        .all(...decParams);

    return { increases, decreases, date, window, rarity: rarityFilter };
}

/**
 * Format movers into strings for embed fields.
 */
export function formatMoversForDiscord(m) {
    if (!m.date) {
        return {
            header: "No snapshot data available. Run a snapshot first.",
            incText: "N/A",
            decText: "N/A"
        };
    }

    const label = m.window === "24h" ? "24h" : "7d";
    const rarityText = m.rarity ? ` — Rarity: **${m.rarity}**` : "";
    const header = `${label} price change as of **${m.date}**${rarityText}`;

    const formatRow = (c, idx) => {
        const name = c.name ?? `Product #${c.productId}`;
        const set = c.setName ?? "Unknown Set";
        const rarity = c.rarity ?? "Unknown";
        const printing = c.printing ?? "Non-Foil";
        const price = c.price != null ? `$${c.price.toFixed(2)}` : "N/A";

        const delta = c.change ?? 0;
        const deltaStr = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
        const arrow = delta > 0 ? "🔺" : delta < 0 ? "🔻" : "➖";

        return [
            `${idx + 1}. **${name}** — ${set} — ${rarity} — ${printing}` +
            `\n💰 ${price}` +
            `\n${arrow} Δ${label}: **${deltaStr}**`
        ];
    };

    const incText =
        m.increases.length > 0
            ? m.increases.map(formatRow).join("\n\n")
            : "None";

    const decText =
        m.decreases.length > 0
            ? m.decreases.map(formatRow).join("\n\n")
            : "None";

    return { header, incText, decText };
}

/**
 * Get highest priced cards from latest snapshot.
 */
export function getHighestPriced(limit = 10, rarityFilter = null) {
    const latestRow = db
        .prepare(
            `SELECT DISTINCT snapshot_date
             FROM price_snapshots
             ORDER BY snapshot_date DESC
                 LIMIT 1`
        )
        .get();

    if (!latestRow) {
        return { rows: [], date: null, rarity: rarityFilter };
    }

    const date = latestRow.snapshot_date;
    const rarityClause = rarityFilter ? " AND LOWER(c.rarity) = LOWER(?)" : "";
    const params = rarityFilter ? [date, rarityFilter, limit] : [date, limit];

    const rows = db
        .prepare(
            `
                SELECT
                    ps.product_id AS productId,
                    c.name AS name,
                    c.set_name AS setName,
                    c.rarity AS rarity,
                    ps.market_price AS price,
                    ps.printing AS printing
                FROM price_snapshots ps
                         JOIN cards c ON c.product_id = ps.product_id
                WHERE ps.snapshot_date = ?
                    ${rarityClause}
                ORDER BY ps.market_price DESC
                    LIMIT ?
            `
        )
        .all(...params);

    return { rows, date, rarity: rarityFilter };
}

/**
 * Format highest-price list for embeds.
 */
export function formatHighestForDiscord(result) {
    const { rows, date, rarity } = result;

    if (!date) {
        return {
            header: "No snapshot data available.",
            text: "N/A"
        };
    }

    const rarityText = rarity ? ` — Rarity: **${rarity}**` : "";
    const header = `Highest priced cards as of **${date}**${rarityText}`;

    const text =
        rows.length > 0
            ? rows
                .map((c, idx) => {
                    const name = c.name ?? `Product #${c.productId}`;
                    const set = c.setName ?? "Unknown Set";
                    const cardRarity = c.rarity ?? "Unknown";
                    const printing = c.printing ?? "Non-Foil";
                    const price = c.price != null ? `$${c.price.toFixed(2)}` : "N/A";

                    return [
                        `${idx + 1}. **${name}** — ${set} — ${cardRarity} — ${printing}` +
                        `\n💰 ${price}`
                    ];
                })
                .join("\n\n")
            : "None";

    return { header, text };
}

/**
 * Card price search using latest snapshot.
 */
export function searchCardPrices(nameQuery, limit = 5) {
    const latestRow = db
        .prepare(
            `SELECT DISTINCT snapshot_date
             FROM price_snapshots
             ORDER BY snapshot_date DESC
                 LIMIT 1`
        )
        .get();

    if (!latestRow) {
        return { rows: [], date: null, query: nameQuery };
    }

    const date = latestRow.snapshot_date;
    const likeQuery = `%${nameQuery}%`;

    const rows = db
        .prepare(
            `
                SELECT
                    ps.product_id AS productId,
                    c.name AS name,
                    c.set_name AS setName,
                    c.rarity AS rarity,
                    ps.market_price AS price,
                    ps.price_change_24h AS change24h,
                    ps.price_change_7d AS change7d,
                    ps.printing AS printing
                FROM price_snapshots ps
                         JOIN cards c ON c.product_id = ps.product_id
                WHERE ps.snapshot_date = ?
                  AND LOWER(c.name) LIKE LOWER(?)
                ORDER BY c.name ASC
                    LIMIT ?
            `
        )
        .all(date, likeQuery, limit);

    return { rows, date, query: nameQuery };
}

/**
 * Format card search results for embeds.
 */
export function formatCardSearchForDiscord(result) {
    const { rows, date, query } = result;

    if (!date) {
        return {
            header: "No snapshot data available.",
            text: "N/A"
        };
    }

    if (rows.length === 0) {
        return {
            header: `No matches found for "**${query}**" as of **${date}**.`,
            text: "Try a different name or spelling."
        };
    }

    const header = `Results for "**${query}**" as of **${date}**`;

    const text = rows
        .map((c, idx) => {
            const name = c.name ?? `Product #${c.productId}`;
            const set = c.setName ?? "Unknown Set";
            const rarity = c.rarity ?? "Unknown";
            const printing = c.printing ?? "Non-Foil";
            const price = c.price != null ? `$${c.price.toFixed(2)}` : "N/A";

            const d24 = c.change24h ?? 0;
            const d7 = c.change7d ?? 0;

            const d24Str = `${d24 >= 0 ? "+" : ""}${d24.toFixed(2)}`;
            const d7Str = `${d7 >= 0 ? "+" : ""}${d7.toFixed(2)}`;

            const arrow24 = d24 > 0 ? "🔺" : d24 < 0 ? "🔻" : "➖";
            const arrow7 = d7 > 0 ? "🔺" : d7 < 0 ? "🔻" : "➖";

            return [
                `${idx + 1}. **${name}** — ${set} — ${rarity} — ${printing}` +
                `\n💰 ${price}` +
                `\n${arrow24} Δ24h: **${d24Str}** • ${arrow7} Δ7d: **${d7Str}**`
            ];
        })
        .join("\n\n");

    return { header, text };
}