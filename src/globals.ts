import {Client, Snowflake} from "discord.js";
import 'dotenv/config';

export let channels: any;
export let revivalGuild: { members: { fetch: (arg0: string) => any; }; };

export async function setGlobals(client: Client) {
    channels = client.channels;
    revivalGuild = await client.guilds.fetch(process.env.GUILD_ID as Snowflake);
}
