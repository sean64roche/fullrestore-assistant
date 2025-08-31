import {ChatInputCommandInteraction, GuildMember, MessageFlags, SlashCommandBuilder, Snowflake} from "discord.js";

import {apiConfig} from "../../repositories.js";
import axios from "axios";
import {findTournamentBySignupSnowflake} from "./tournament.js";
import {TournamentResponse} from "@fullrestore/service";
import {revivalGuild} from "../../globals.js";

export type DiscordPlayer = {
    discordUser: string;
    discordId: string;
}

export const OUT_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('out')
        .setDescription('Cancel your sign-up'),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const tournament = await findTournamentBySignupSnowflake(interaction);
            if (!tournament) {
                await interaction.reply({
                    content: "No tournament found in this channel.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            await (interaction.member as GuildMember).roles.remove(tournament.role_snowflake as Snowflake);
            const player: DiscordPlayer = {
                discordUser: interaction.user.username,
                discordId: interaction.user.id,
            }
            await removeEntrantPlayer(interaction, player, tournament);
            await interaction.reply(`Sign-up ${await revivalGuild.members.fetch(player.discordId)} removed.`);
        } catch (error) {
            throw error;
        }
    }
};
export async function removeEntrantPlayer(interaction: ChatInputCommandInteraction, discordPlayer: DiscordPlayer, tournament: TournamentResponse) {
    try {
        const player = await axios.get(
            apiConfig.baseUrl + apiConfig.playersEndpoint + `?discord_id=${discordPlayer.discordId}`
        );
        const pairings = await axios.get(
            apiConfig.baseUrl + apiConfig.pairingsEndpoint + `?discord_user=${discordPlayer.discordUser}&tournament_slug=${tournament.slug}`
        );
        if (pairings.data.length > 0) {
            await interaction.reply({
                content: "This tournament has already begun. Please contact the tournament hosts for help.",
                flags: MessageFlags.Ephemeral,
            });
        }
        await axios.delete(apiConfig.baseUrl + apiConfig.entrantPlayersEndpoint + `?player_id=${player.data.id}&tournament_slug=${tournament.slug}`);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            await interaction.reply({
                content: "You don't seem to be signed up for this tournament.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        throw error;
    }
}
