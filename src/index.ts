import fs from "node:fs"
import path from "node:path"
import { Client, Events, Collection, GatewayIntentBits, SlashCommandBuilder, ChatInputCommandInteraction, Guild, CategoryChannel, ChannelType, GuildBasedChannel, SlashCommandStringOption, GuildChannel } from "discord.js"
import "dotenv/config"
import { exec } from "node:child_process"
import util from "node:util"
import proc from "node:process"
import { fetchTeams } from "./utils"

const aexec = util.promisify(exec);

export interface Command {
	data: any;
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
	// Setup database
	const DB_NAME = "db"
	const TABLE="channel_team"
	exec(`echo 'CREATE TABLE IF NOT EXISTS ${TABLE} (d_channel_id TEXT PRIMARY KEY, d_vchannel_id TEXT, d_role_id TEXT, pc_team_id TEXT);' | sqlite3 ${DB_NAME}`, (err) => {
		if (err) {
			console.error("An error occured while initializing database!", err)
		}
	})

	const categoryName = "AFEC Teams"

	// Add/Remove team channels from guild. Adding new teams also assigns a unique role for that channel
	async function setTeamChannels(guild: Guild, parent: CategoryChannel) {
		const teams = await fetchTeams();
		const channels = guild.channels.cache;

		// Cull non-existant Discord text channels in DB
		// Note: Originally this was built with only text channels in mind. So if the text channel exists but its voice channel
		//   doesn't, then voice channel will be added back when adding Discord channels. However, if the text channel exists but the VC doesn't
		//   then it probably won't be added back. You shouldn't be deleting channels anyway.
		let { stdout, stderr } = await aexec(`echo 'SELECT d_channel_id FROM ${TABLE};' | sqlite3 -cmd ".timeout 1000" ${DB_NAME}`);
		if(stderr) {
			console.error(stderr)
			return
		}
		stdout.split('\n')
			.filter((l) => l.length !== 0)
			.map(async (gid) => {
				if (!channels.has(gid)) {
					// Clean role (maybe not needed?)
					// let { stdout, stderr } = await aexec(`echo 'SELECT d_role_id FROM ${TABLE} WHERE d_channel_id=${gid};' | sqlite3 -cmd ".timeout 1000" ${DB_NAME}`);
					// if (stderr) {
					// 	console.error("An error occured while executing SQL statement!", stderr)
					// 	return
					// }
					// const role = guild.roles.cache.get(stdout.trim());
					// if (role) {
					// 	guild.roles.delete(role);
					// } else {
					// 	console.warn("Could not get role while cull!");
					// }

					let { stdout, stderr } = await aexec(`echo 'SELECT d_vchannel_id FROM ${TABLE} WHERE d_channel_id=${gid};' | sqlite3 -cmd ".timeout 1000" ${DB_NAME}`);
					const vc_id = stdout.trim();
					if(vc_id) {
						guild.channels.delete(vc_id);
					}

					({ stderr } = await aexec(`echo 'DELETE FROM ${TABLE} WHERE d_channel_id="${gid}";' | sqlite3 -cmd ".timeout 1000" ${DB_NAME}`));
					if (stderr) {
						console.error("An error occured while executing SQL statement!", stderr)
						return
					}
				}
			});

		// Add Discord channel if the team does not have one
		for (const team of teams) {
			let { stdout, stderr } = await aexec(`echo 'SELECT d_channel_id FROM ${TABLE} WHERE pc_team_id="${team._id}";' | sqlite3 -cmd ".timeout 1000" ${DB_NAME}`);
			if (stderr) {
				console.error("An error occured while executing SQL statement!", stderr);
				return
			}
			if (stdout.length === 0) {
				const textChan = await guild.channels.create({ name: team.name, reason: "New AFEC Team" });
				const voiceChan = await guild.channels.create({ name:team.name, type: ChannelType.GuildVoice, reason: "New AFEC Team" });
				const role = await guild.roles.create({ name: team.name, reason: "New AFEC Team"});

				let { stderr } = await aexec(`echo 'INSERT INTO ${TABLE} VALUES("${textChan.id}", ${voiceChan.id}, ${role.id}, "${team._id}");' | sqlite3 -cmd ".timeout 1000" ${DB_NAME}`);
				if (stderr) {
					console.error("An error occured while executing SQL statement!", stderr)
					return
				}

				await textChan.setParent(parent);
				await voiceChan.setParent(parent);

				const everyone = guild.roles.everyone;
				const clientUser = client.user;
				if (everyone && clientUser) {
					await textChan.permissionOverwrites.edit(clientUser, {ViewChannel: true, ManageChannels: true});
					await voiceChan.permissionOverwrites.edit(clientUser, {ViewChannel: true, ManageChannels: true});

					await textChan.permissionOverwrites.edit(everyone, {ViewChannel: false});
					await voiceChan.permissionOverwrites.edit(everyone, {ViewChannel: false});

					await textChan.permissionOverwrites.edit(role, {ViewChannel: true});
					await voiceChan.permissionOverwrites.edit(role, {ViewChannel: true});
				} else {
					console.error("An error occured while writig permissions to channel!");
				}

			}
		}

		// Cull "zombie" team channels which are no longer in Pilotcity (Since you can't delete teams this probably isn't needed)
		// Set C = Guild Channels in AFEC Teams category
		// Set T = Pilotcity teams
		// Set Z = C - T
		// const zombieTeams = channels.filter(c => c.parent instanceof CategoryChannel && c.parent.name === categoryName && !teams.find(t => t.name === c.name))
		// const zombieTeams = 
	}

	async function getTeamsCategory(guild: Guild) {
		const channels = guild.channels.cache;
		// channels.forEach(c => {console.log(c.name)})
		const key = channels.findKey(c => c.name === categoryName && c instanceof CategoryChannel);
		if (key) {
			return channels.get(key) as CategoryChannel;
		}
		return undefined;
	}

	async function addTeamsCategory(guild: Guild) {
		return await guild.channels.create({ 
			name: categoryName, 
			type: ChannelType.GuildCategory,
			reason: "Addded new channel category that will be managed by this bot"
		})
	}

	// Run every 60 seconds
	async function poll() {
		const guildId = proc.env.GUILD_ID;
		let categoryChannel: CategoryChannel | undefined;

		if (guildId) {
			const guild = client.guilds.cache.get(guildId)
			if (guild && guild.available) {
				// Create a Teams category, if it does not already exist
				if (!(await getTeamsCategory(guild))) {
					console.warn("Could not find category!")
					categoryChannel = await addTeamsCategory(guild)
				}
				else {
					categoryChannel = await getTeamsCategory(guild);
				}

				if (categoryChannel) {
					// Manage team channels
					setTeamChannels(guild, categoryChannel);
				}
			}
		}

		setTimeout(poll, 60000)
	}
	poll()
})

// Log in to Discord with your client's token
client.login(proc.env.D_TOKEN);
