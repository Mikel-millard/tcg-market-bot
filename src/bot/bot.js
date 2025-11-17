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

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
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

    await interaction.deferReply();

    // 🔎 /card-price: search a card by name and show price + changes
    if (commandName === "card-price") {
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

    // For the other commands, we use a numeric "top" argument
    let top = interaction.options.getInteger("top") ?? 10;
    if (top < 1) top = 1;
    if (top > 25) top = 25;

    const rarity = interaction.options.getString("rarity") || null;

    // 💰 /market-watch-highest: highest priced cards
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

    // 📈 /market-watch-weekly and /market-watch-daily (separate embeds)
    const window = commandName === "market-watch-daily" ? "24h" : "7d";
    const movers = getMovers(top, window, rarity);
    const { header, incText, decText } = formatMoversForDiscord(movers);

    const baseTitle =
        window === "24h"
            ? `Riftbound Market Watch — 24h Movers (Top ${top})`
            : `Riftbound Market Watch — 7d Movers (Top ${top})`;

    const titleSuffix = rarity ? ` — ${rarity}` : "";
    const fullBaseTitle = `${baseTitle}${titleSuffix}`;

    const embedInc = new EmbedBuilder()
        .setTitle(`${fullBaseTitle} — Increases`)
        .setDescription(header)
        .addFields({ name: "📈 Biggest Increases", value: incText })
        .setColor(0x2ecc71) // green
        .setTimestamp();

    const embedDec = new EmbedBuilder()
        .setTitle(`${fullBaseTitle} — Decreases`)
        .setDescription(header)
        .addFields({ name: "📉 Biggest Decreases", value: decText })
        .setColor(0xe74c3c) // red
        .setTimestamp();

    await interaction.editReply({ embeds: [embedInc, embedDec] });
});

client.login(process.env.DISCORD_TOKEN);