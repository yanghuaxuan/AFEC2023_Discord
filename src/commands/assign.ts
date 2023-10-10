import { SlashCommandBuilder } from "discord.js";
import { ChatInputCommandInteraction } from "discord.js";
import { Command } from "../index"

module.exports = {
	data: new SlashCommandBuilder()
		.setName('assign')
		.setDescription('Assign your Discord account to a team'),
	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.reply('Pong!');
	},
} as Command;