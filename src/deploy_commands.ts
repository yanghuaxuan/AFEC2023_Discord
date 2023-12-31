/* eslint-disable @typescript-eslint/no-var-requires */
import fs from "node:fs";
import path from "node:path";
import "dotenv/config"
import { REST, Routes } from "discord.js";

const commands = [];
// Grab all the command files from the commands directory you created earlier
const foldersPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(foldersPath);

console.log(commandFiles);

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
    const filePath = path.join(foldersPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Construct and prepare an instance of the REST module
console.log(process.env.D_TOKEN)
const rest = new REST().setToken(process.env.D_TOKEN as string);

// and deploy your commands!
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID as string, process.env.GUILD_ID as string),
            { body: commands },
        );

        console.log("Successfully reloaded application (/) commands.");

    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
})();