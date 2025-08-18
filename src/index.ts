// Require the necessary discord.js classes
import {Client, Collection, Events, GatewayIntentBits} from 'discord.js';
import { setGlobals } from './globals.js';
import ALL_COMMANDS from './commands/allcommands.js';
import * as dotenv from "dotenv";

declare module 'discord.js' {
    export interface Client {
        commands: Collection<string, any>;
    }
}

dotenv.config();

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds], allowedMentions: { parse: ['users', 'roles'], repliedUser: true } });
client.commands = new Collection();

console.log(ALL_COMMANDS);

for (const command of ALL_COMMANDS) {
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	}
}

client.on(Events.InteractionCreate, interaction => {
    console.log("Channel ID: ", interaction.channelId);
});

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	const command = interaction.client.commands.get(interaction.commandName);

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

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	setGlobals(client);

});

// Log in to Discord with your client's token
client.login(process.env.TOKEN as string);
