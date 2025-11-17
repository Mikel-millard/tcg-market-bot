// src/bot/commands.js
import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

const commands = [
    new SlashCommandBuilder()
        .setName("market-watch")
        .setDescription("Show the weekly market watch for Riftbound TCG prices.")
        .addIntegerOption(opt =>
            opt
                .setName("top")
                .setDescription("Number to show (5 or 10)")
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
