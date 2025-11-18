import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

const commands = [
    new SlashCommandBuilder()
        .setName("market-watch-weekly")
        .setDescription("Show 7-day Riftbound price movers.")
        .addIntegerOption((opt) =>
            opt
                .setName("top")
                .setDescription("Number to show (default 5, max 10)")
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt
                .setName("rarity")
                .setDescription("Filter by rarity (e.g. Common, Rare, Epic, Legendary, Showcase)")
                .setRequired(false)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName("market-watch-daily")
        .setDescription("Show 24-hour Riftbound price movers.")
        .addIntegerOption((opt) =>
            opt
                .setName("top")
                .setDescription("Number to show (default 10, max 25)")
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt
                .setName("rarity")
                .setDescription("Filter by rarity (e.g. Common, Rare, Epic, Legendary, Showcase)")
                .setRequired(false)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName("market-watch-highest")
        .setDescription("Show the highest priced Riftbound cards.")
        .addIntegerOption((opt) =>
            opt
                .setName("top")
                .setDescription("Number to show (default 5, max 10)")
                .setRequired(false)
        )
        .addStringOption((opt) =>
            opt
                .setName("rarity")
                .setDescription("Filter by rarity (e.g. Common, Rare, Epic, Legendary, Showcase)")
                .setRequired(false)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName("card-price")
        .setDescription("Look up current price and recent changes for a card.")
        .addStringOption((opt) =>
            opt
                .setName("name")
                .setDescription("Card name (or part of it)")
                .setRequired(true)
        )
        .addIntegerOption((opt) =>
            opt
                .setName("limit")
                .setDescription("Max matches to show (default 5, max 10)")
                .setRequired(false)
        )
        .toJSON()
];

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

async function main() {
    try {
        console.log("Deploying slash commands...");

        await rest.put(
            Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
            { body: commands }
        );

        console.log("✓ Commands deployed.");
    } catch (err) {
        console.error(err);
    }
}

main();