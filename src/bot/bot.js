import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import {
    getMovers,
    formatMoversForDiscord,
    getHighestPriced,
    formatHighestForDiscord,
    searchCardPrices,
    formatCardSearchForDiscord
} from "../data/movers.js";
import cron from "node-cron";
import { exec } from "node:child_process";

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Avoid overlapping snapshots
let snapshotRunning = false;

function runSnapshotViaExec() {
    if (snapshotRunning) {
        console.log("[snapshot] Already running; skipping new trigger.");
        return;
    }

    snapshotRunning = true;
    console.log("[snapshot] Starting snapshot job (npm run snapshot)...");

    exec("npm run snapshot", (error, stdout, stderr) => {
        if (stdout) {
            console.log("[snapshot stdout]");
            console.log(stdout);
        }
        if (stderr) {
            console.error("[snapshot stderr]");
            console.error(stderr);
        }

        if (error) {
            console.error("[snapshot error]", error);
        } else {
            console.log("[snapshot] Completed successfully.");
        }

        snapshotRunning = false;
    });
}

client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);

    // Daily cron: 11:00 UTC ≈ 3:00 AM PT
    cron.schedule("0 11 * * *", () => {
        console.log("[cron] Triggering daily snapshot at 11:00 UTC.");
        runSnapshotViaExec();
    });
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (
        commandName !== "market-watch-weekly" &&
        commandName !== "market-watch-daily" &&
        commandName !== "market-watch-highest" &&
        commandName !== "card-price"
    ) {
        return;
    }

    // 🔎 /card-price: search a card by name and show price + changes
    if (commandName === "card-price") {
        await interaction.deferReply();

        const nameQuery = interaction.options.getString("name", true);
        let limit = interaction.options.getInteger("limit") ?? 5;
        if (limit < 1) limit = 1;
        if (limit > 10) limit = 10;

        const result = searchCardPrices(nameQuery, limit);
        const { header, text } = formatCardSearchForDiscord(result);

        const embed = new EmbedBuilder()
            .setTitle("Riftbound Card Price Lookup")
            .setDescription(header)
            .addFields({ name: "Results", value: text })
            .setColor(0x3498db) // blue
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    // For market-watch commands, `top` = number per tier
    let top = interaction.options.getInteger("top") ?? 5;
    if (top < 1) top = 1;
    if (top > 10) top = 10;

    const rarity = interaction.options.getString("rarity") || null;

    await interaction.deferReply();

    // 💰 /market-watch-highest: highest priced cards (not tiered by price)
    if (commandName === "market-watch-highest") {
        const result = getHighestPriced(top, rarity);
        const { header, text } = formatHighestForDiscord(result);

        const titleBase = `Riftbound Market Watch — Highest Prices (Top ${top})`;
        const title = rarity ? `${titleBase} — ${rarity}` : titleBase;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(header)
            .addFields({ name: "💰 Highest Priced Cards", value: text })
            .setColor(0xf1c40f) // gold/yellow
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    // 📈 /market-watch-weekly and /market-watch-daily (tiered embeds)
    const window = commandName === "market-watch-daily" ? "24h" : "7d";
    const movers = getMovers(top, window, rarity);
    const {
        header,
        incHigh,
        incMid,
        incLow,
        decHigh,
        decMid,
        decLow
    } = formatMoversForDiscord(movers);

    const baseTitle =
        window === "24h"
            ? `Riftbound Market Watch — 24h Changes (Top ${top} per tier)`
            : `Riftbound Market Watch — 7d Changes (Top ${top} per tier)`;

    const titleSuffix = rarity ? ` — ${rarity}` : "";
    const fullBaseTitle = `${baseTitle}${titleSuffix}`;

    const embeds = [];

    // Helper to decide if a tier actually has data
    const hasContent = (str) =>
        str && str.trim() && str.trim().toLowerCase() !== "none" && str !== "N/A";

    // Increases embeds
    if (hasContent(incHigh)) {
        embeds.push(
            new EmbedBuilder()
                .setTitle(`${fullBaseTitle} — High-Value Increases (≥ $20)`)
                .setDescription(header)
                .addFields({ name: "Results", value: incHigh })
                .setColor(0x2ecc71) // green
                .setTimestamp()
        );
    }

    if (hasContent(incMid)) {
        embeds.push(
            new EmbedBuilder()
                .setTitle(`${fullBaseTitle} — Mid-Value Increases ($5–$20)`)
                .setDescription(header)
                .addFields({ name: "Results", value: incMid })
                .setColor(0x2ecc71)
                .setTimestamp()
        );
    }

    if (hasContent(incLow)) {
        embeds.push(
            new EmbedBuilder()
                .setTitle(`${fullBaseTitle} — Low-Value Increases (< $5)`)
                .setDescription(header)
                .addFields({ name: "Results", value: incLow })
                .setColor(0x2ecc71)
                .setTimestamp()
        );
    }

    // Decreases embeds
    if (hasContent(decHigh)) {
        embeds.push(
            new EmbedBuilder()
                .setTitle(`${fullBaseTitle} — High-Value Decreases (≥ $20)`)
                .setDescription(header)
                .addFields({ name: "Results", value: decHigh })
                .setColor(0xe74c3c) // red
                .setTimestamp()
        );
    }

    if (hasContent(decMid)) {
        embeds.push(
            new EmbedBuilder()
                .setTitle(`${fullBaseTitle} — Mid-Value Decreases ($5–$20)`)
                .setDescription(header)
                .addFields({ name: "Results", value: decMid })
                .setColor(0xe74c3c)
                .setTimestamp()
        );
    }

    if (hasContent(decLow)) {
        embeds.push(
            new EmbedBuilder()
                .setTitle(`${fullBaseTitle} — Low-Value Decreases (< $5)`)
                .setDescription(header)
                .addFields({ name: "Results", value: decLow })
                .setColor(0xe74c3c)
                .setTimestamp()
        );
    }

    // Fallback if absolutely nothing had data
    if (embeds.length === 0) {
        embeds.push(
            new EmbedBuilder()
                .setTitle(fullBaseTitle)
                .setDescription(`${header}\n\nNo changes found for any tier.`)
                .setColor(0x95a5a6) // grey
                .setTimestamp()
        );
    }

    await interaction.editReply({ embeds });
});

client.login(process.env.DISCORD_TOKEN);