// src/bot/bot.js
import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { getWeeklyMovers, formatMoversForDiscord } from "../data/movers.js";

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "market-watch") return;

    await interaction.deferReply();

    let top = interaction.options.getInteger("top") ?? 5;
    if (top < 1) top = 1;
    if (top > 10) top = 10;

    const movers = getWeeklyMovers(top);
    const { header, incText, decText } = formatMoversForDiscord(movers);

    const embed = new EmbedBuilder()
        .setTitle(`Riftbound Market Watch (Top ${top})`)
        .setDescription(header)
        .addFields(
            { name: "📈 Biggest Increases", value: incText },
            { name: "📉 Biggest Decreases", value: decText }
        );

    await interaction.editReply({ embeds: [embed] });
});

client.login(process.env.DISCORD_TOKEN);
