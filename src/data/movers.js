// src/data/movers.js
import db from "./database.js";

function getLastTwoSnapshotDates() {
    const latest = db.prepare(`
    SELECT DISTINCT snapshot_date
    FROM price_snapshots
    ORDER BY snapshot_date DESC
    LIMIT 1
  `).get();

    if (!latest) return null;

    const previous = db.prepare(`
    SELECT DISTINCT snapshot_date
    FROM price_snapshots
    WHERE snapshot_date < ?
    ORDER BY snapshot_date DESC
    LIMIT 1
  `).get(latest.snapshot_date);

    if (!previous) return null;

    return {
        latest: latest.snapshot_date,
        previous: previous.snapshot_date
    };
}

export function getWeeklyMovers(limit = 5) {
    const dates = getLastTwoSnapshotDates();
    if (!dates) return { increases: [], decreases: [], dates: null };

    const rows = db.prepare(`
    SELECT
      new.product_id AS productId,
      c.name AS name,
      c.set_name AS setName,
      old.market_price AS oldPrice,
      new.market_price AS newPrice,
      (new.market_price - old.market_price) AS diff
    FROM price_snapshots new
    JOIN price_snapshots old ON old.product_id = new.product_id
    LEFT JOIN cards c ON c.product_id = new.product_id
    WHERE new.snapshot_date = ?
      AND old.snapshot_date = ?
      AND old.market_price IS NOT NULL
      AND new.market_price IS NOT NULL
  `).all(dates.latest, dates.previous);

    const increases = rows
        .filter(r => r.diff > 0)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, limit);

    const decreases = rows
        .filter(r => r.diff < 0)
        .sort((a, b) => a.diff - b.diff)
        .slice(0, limit);

    return { increases, decreases, dates };
}

export function formatMoversForDiscord(m) {
    if (!m.dates) {
        return {
            header: "No snapshot data yet—run the snapshot job twice.",
            incText: "N/A",
            decText: "N/A"
        };
    }

    const header = `Comparing **${m.dates.previous} → ${m.dates.latest}**`;

    const incText = m.increases
        .map(r => {
            const name = r.name || `Product #${r.productId}`;
            return `• **${name}**: $${r.oldPrice} → $${r.newPrice} (**+${r.diff.toFixed(2)}**)`;
        })
        .join("\n") || "None";

    const decText = m.decreases
        .map(r => {
            const name = r.name || `Product #${r.productId}`;
            return `• **${name}**: $${r.oldPrice} → $${r.newPrice} (**${r.diff.toFixed(2)}**)`;
        })
        .join("\n") || "None";

    return { header, incText, decText };
}
