import {ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder} from "discord.js";

import {apiConfig} from "../../repositories.js";
import axios from "axios";
import {findTournamentFromChannelId} from "./in.js";

export const OUT_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('out')
        .setDescription('Cancel your sign-up'),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await removeEntrantPlayer(interaction);
        } catch (error) {
            throw error;
        }
    }
};
async function removeEntrantPlayer(interaction: ChatInputCommandInteraction) {
    try {
        const player = await axios.get(
            apiConfig.baseUrl + apiConfig.playersEndpoint + `?discord_id=${interaction.user.id}`
        );
        const tournament = await findTournamentFromChannelId(interaction);
        const pairings = await axios.get(
            apiConfig.baseUrl + apiConfig.pairingsEndpoint + `?discord_user=${interaction.user.username}`
        );
        if (pairings.data.length > 0) {
            await interaction.reply({
                content: "This tournament has already begun. Please contact the tournament hosts for help.",
                flags: MessageFlags.Ephemeral,
            })
        }
        if (tournament) {
            await axios.delete(apiConfig.baseUrl + apiConfig.entrantPlayersEndpoint + `?player_id=${player.data.id}&tournament_slug=${tournament.slug}`);
            await interaction.reply(`Sign-up ${interaction.user.username} removed.`);
        }

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
