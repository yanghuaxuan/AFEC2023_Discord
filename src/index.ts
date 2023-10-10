import fs from "node:fs"
import path from "node:path"
import { Client, Events, Collection, GatewayIntentBits, SlashCommandBuilder, ChatInputCommandInteraction, Guild, CategoryChannel, ChannelType } from "discord.js"
import "dotenv/config"
import proc from "node:process"

export interface Command {
	data: SlashCommandBuilder;
	execute: (interaction: ChatInputCommandInteraction)	=> void;
}

export interface ClientEx extends Client {
    commands: Collection<string, Command>;
}

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] }) as ClientEx;

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`Commands loaded in bot: ${commandFiles}`);

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath) as Command;
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const command = (interaction.client as ClientEx).commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.ClientReady, c => {
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
	// Fetch teams data from Pilotcity
	async function fetchTeams(): Promise<TeamSchema[]> {
		const PROGRAM_ID = proc.env.PC_PROGRAM_ID;
		const TOKEN = proc.env.PC_OAUTH_TOKEN;

		if (!PROGRAM_ID && !TOKEN) {
			return [];
		}

		const url = proc.env.PC_PROGRAM_SERVICE_URL + `/programs/teams?program_id=${PROGRAM_ID}`
		const tokenHeader = new Headers({"Authorization": TOKEN as string})
		const resp = await fetch(url, {headers: tokenHeader})

		if (resp.status !== 200) {
			return []
		}

		const teams = (await resp.json() as ResponseJsonSchema).data

		return teams
	}

	// Add/Remove team channels. Adding new teams also assigns a unique role for that channel
	// async function setTeamChannels() {
	// 	const teams = await fetchTeams();
	// }

	const category = "AFEC Teams"

	async function guildHasTeamsCategory(guild: Guild): Promise<boolean> {
		const channels = guild.channels.cache;
		// channels.forEach(c => {console.log(c.name)})
		if (channels.findKey(c => c.name === category && c instanceof CategoryChannel)) {
			return true;
		}
		return false;
	}

	async function addTeamsCategory(guild: Guild) {
		guild.channels.create({ 
			name: category, 
			type: ChannelType.GuildCategory,
			reason: "Addded new channel category that will be managed by this bot"
		})
	}

	// Run every 360 seconds
	async function poll() {
		const guildId = proc.env.GUILD_ID;
		if (guildId) {
			const guild = client.guilds.cache.get(guildId)
			if (guild && guild.available) {
				// Create a Teams category, if it does not already exist
				if (!(await guildHasTeamsCategory(guild))) {
					console.warn("Could not find category!")
					addTeamsCategory(guild)
				}
				else {
					console.log("Found category!")
				}

				// setTeamChannels();
			}
		}

		setTimeout(poll, 180000)
	}
	poll()
})

// Log in to Discord with your client's token
client.login(proc.env.D_TOKEN);
