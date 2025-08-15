import 'dotenv/config';

export let channels;
export let revivalGuild;

export async function setGlobals(client) {
    channels = client.channels;
    revivalGuild = await client.guilds.fetch(process.env.GUILD_ID);
}