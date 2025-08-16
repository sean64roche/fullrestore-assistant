import { REST, Routes, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';
import ALL_COMMANDS from './commands/allcommands.js';

const commands = [];

for (const command of ALL_COMMANDS) {
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.TOKEN as string);

// and deploy your commands!
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(process.env.CLIENT_ID as string, process.env.GUILD_ID as string),
			{ body: commands },
		) as RESTPostAPIApplicationCommandsJSONBody[];
		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();
