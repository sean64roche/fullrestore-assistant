import {ChatInputCommandInteraction, SlashCommandBuilder, MessageFlags} from "discord.js";
import {PlayerDto, TournamentEntity} from "@fullrestore/service";
import {apiConfig, playerRepo} from "../../repositories.js";
import axios from "axios";

export const PLAYER_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('player')
        .setDescription('Commands for interacting with player data.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('in')
                .setDescription('Sign up for the tournament opened in this channel')
                .addStringOption(option =>
                    option.setName('ps_username')
                        .setDescription('Your Pokemon Showdown username')
                        .setRequired(true)
                )
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        switch (interaction.options.getSubcommand()) {
            case 'in':
                try {
                    const newEntrant = await createEntrantPlayer(interaction);
                } catch (error) {
                    throw error;
                }
                break;
        }
    }
};

async function createEntrantPlayer(interaction: ChatInputCommandInteraction) {
    const player: PlayerDto = {
        ps_user: interaction.options.getString('ps_username')!,
        discord_user: interaction.user.username,
        discord_id: interaction.user.id,
    }

    const tournament: TournamentEntity = await findTournamentFromChannelId(interaction);

    try {
        if (interaction.channel?.id === tournament.signupSnowflake) {
            return await playerRepo.createPlayer(player);
        }
    } catch (error) {
        await interaction.reply(
            `Error: ${interaction.user} signup failed. 
            PS username: ${interaction.options.getString('ps_username')}`
        );
    }
}

async function findTournamentFromChannelId(interaction: ChatInputCommandInteraction) {
    try {
        const tournament = await axios.get(apiConfig.baseUrl + apiConfig.tournamentsEndpoint + `?signup_snowflake=${interaction.channel?.id}`);
        return tournament.data;
    } catch (error) {
        await interaction.reply({
            content: "No signups found in this channel.",
            flags: MessageFlags.Ephemeral,
        });
    }
}
