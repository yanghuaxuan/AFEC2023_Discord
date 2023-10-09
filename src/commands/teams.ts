import { SlashCommandBuilder } from "discord.js";
import { ChatInputCommandInteraction } from "discord.js";
import { Command } from "../index"
import proc from "node:process"

interface MembersSchema {
    _id: string;
    firstName: string;
    lastName: string;
    avatar: string;
}

interface TeamSchema {
    _id: string;
    owner: string;
    program_id: string;
    name: string;
    password: string;
    members: MembersSchema[]
    adks: Array<unknown>
}

interface ResponseJsonSchema {
    message: string;
    data: TeamSchema[];
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('teams')
		.setDescription('Get all teams in AFEC'),
	async execute(interaction: ChatInputCommandInteraction) {
        const PROGRAM_ID = proc.env.PC_PROGRAM_ID;
        const TOKEN = proc.env.PC_OAUTH_TOKEN;

        if (!PROGRAM_ID && !TOKEN) {
            await interaction.reply("Internal error!")
            return
        }

        const url = proc.env.PC_PROGRAM_SERVICE_URL + `/programs/teams?program_id=${PROGRAM_ID}`
        const tokenHeader = new Headers({"Authorization": TOKEN as string})
        const resp = await fetch(url, {headers: tokenHeader})
        const teams = (await resp.json() as ResponseJsonSchema).data
            .map(team => team.name);

        const fmtStr = `**Teams**:\n${teams.reduce((acc, cur) => acc + '\n' + cur)}`

        await interaction.reply(fmtStr)
	},
} as Command;