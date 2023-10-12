import { GuildMember, SlashCommandBuilder } from "discord.js";
import { ChatInputCommandInteraction } from "discord.js";
import { Command } from "../index"
import { fetchTeams } from "../utils";
import { exec } from "node:child_process"
import util from "node:util"

const aexec = util.promisify(exec);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Assign your Discord account to a team')
        .addStringOption(opt => 
            opt.setName("firstname")
            .setDescription("Your first name")
            .setRequired(true))
        .addStringOption(opt =>
            opt.setName("lastname")
            .setDescription("Your last nmae")
            .setRequired(true)),
    async execute(interaction: ChatInputCommandInteraction) {
        const fname =  interaction.options.getString("firstname")?.toLowerCase();
        const lname = interaction.options.getString("lastname")?.toLowerCase();

        if (!fname || !lname) {
            interaction.reply("Did not provide first name or last name!");
            return;
        }

        const teams = await fetchTeams();
        let foundName = false;

        for (const team of teams) {
            const p_members = team.members;
            const DB_NAME = "db"
            const TABLE="channel_team"

            p_members.forEach(async (m) => {
                if (m.firstName.toLowerCase() === fname && 
                    m.lastName.toLowerCase() === lname) {
                        foundName = true;

                        let { stdout, stderr } = await aexec(`echo 'SELECT d_role_id FROM ${TABLE} WHERE pc_team_id="${team._id}";' | sqlite3 -cmd ".timeout 1000" ${DB_NAME}`);
                        if (stderr) {
                            await interaction.reply("An error occured");
                            console.error(stderr);
                            return;
                        }

                        const role_id = stdout.trim()
                        if(!role_id) {
                            await interaction.reply("An error occured");
                            console.error("An error occured while retrieving channel id from table!")
                            return;
                        }

                        const role = interaction.guild?.roles.cache.get(role_id);
                        if (role && interaction.member instanceof GuildMember) {
                            interaction.member.roles.add(role)
                            await interaction.reply("Assigned role!");
                        } else {
                            await interaction.reply("Cannot assign role! The bot may take a couple of minutes to recognize your team!\nPlease wait a couple of minutes and try again")
                        }
                }
            })
        }

        if (!foundName) {
            await interaction.reply("Could not find your name! Please try again.");
        }
    },
}  as Command;