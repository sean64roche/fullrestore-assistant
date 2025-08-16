import {ChatInputCommandInteraction, SlashCommandBuilder, MessageFlags, TextChannel} from "discord.js";
import {
    PlayerDto,
    PlayerEntity,
    TournamentEntity, TournamentResponse,
    transformTournamentResponse
} from "@fullrestore/service";
import {apiConfig, playerRepo} from "../../repositories.js";
import axios, {AxiosError} from "axios";
import {channels} from "../../globals.js";

export const IN_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('in')
        .setDescription('Sign up for the tournament in this channel')
        .addStringOption(option =>
            option.setName('ps_username')
                .setDescription('Your Pokemon Showdown username')
                .setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await createEntrantPlayer(interaction);
        } catch (error) {
            throw error;
        }
    }
};

async function createEntrantPlayer(interaction: ChatInputCommandInteraction) {
    const tournamentResponse = await findTournamentFromChannelId(interaction);
    if (!tournamentResponse) {
        await interaction.reply({
            content: "No tournament found in this channel.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    const tournament = transformTournamentResponse(tournamentResponse);
    const player: PlayerEntity = await initPlayer(interaction, tournament);
    try {
        await playerRepo.createEntrantPlayer(player, tournament);
        await interaction.reply(`${interaction.user} has signed up with PS user '${interaction.options.getString('ps_username')}'.`);
    } catch (error) {
        switch (error.status) {
            case 409:
                await interaction.reply({
                    content: "You're already signed up for this tournament!",
                    flags: MessageFlags.Ephemeral,
                });
                break;
            default:
                await produceError(
                    interaction,
                    await channels.fetch(tournament.adminSnowflake) as TextChannel,
                    `Unknown error on createEntrantPlayer: ${interaction.user} signup failed.
                    Message: ${error.message}`
                );
                break;
        }
    }
}

async function initPlayer(interaction: ChatInputCommandInteraction, tournament: TournamentEntity): Promise<PlayerEntity> {
    const player: PlayerDto = {
        ps_user: interaction.options.getString('ps_username')!,
        discord_user: interaction.user.username,
        discord_id: interaction.user.id,
    }
    try {
        const playerResponse = await axios.post(apiConfig.baseUrl + apiConfig.playersEndpoint, player);
        return playerResponse.data;
    } catch (error) {
        const adminChannel = await channels.fetch(tournament.adminSnowflake) as TextChannel;
        if (error instanceof AxiosError) {
            switch (error.response?.status) {
                case 409:
                    return await findExistingPlayer(interaction, player, adminChannel);
                default:
                    await produceError(
                        interaction,
                        adminChannel,
                        `FATAL: API endpoint error on initPlayer: ${JSON.stringify(error.response?.data)}`
                    );
                    throw error;
            }
        } else {
            await produceError(
                interaction,
                adminChannel,
                `Unknown error on initPlayer: ${interaction.user} signup failed.
                Message: ${JSON.stringify(error.message)}`
            );
            throw error;
        }
    }
}

async function findExistingPlayer(interaction: ChatInputCommandInteraction, player: PlayerDto, adminChannel: TextChannel): Promise<PlayerEntity> {
    try {
        const existingPlayer = await axios.get(apiConfig.baseUrl + apiConfig.playersEndpoint + `?discord_user=${player.discord_user}`);
        return existingPlayer.data;
    } catch (error) {
        if (error instanceof AxiosError) {
            switch (error.response?.status) {
                case 404:
                    try {
                        const existingPlayer = await axios.get(apiConfig.baseUrl + apiConfig.playersEndpoint + `?ps_user=${player.ps_user}`);
                        return existingPlayer.data;
                    } catch (error) {
                        await produceError(
                            interaction,
                            adminChannel,
                            `Error on findExistingPlayer: ${interaction.user} duplicate detected but not found.`
                        );
                        throw error;
                    }
                default:
                    await produceError(
                        interaction,
                        adminChannel,
                        `Error on findExistingPlayer: ${interaction.user}
                        Message: ${JSON.stringify(error.message)}`
                    );
                    throw error;
            }
        }
        await produceError(
            interaction,
            adminChannel,
            `Error on findExistingPlayer: ${interaction.user} signup failed`
        );
        throw error;
    }
}

async function produceError(
    interaction: ChatInputCommandInteraction,
    adminChannel: TextChannel,
    adminMessage: string
) {
    await interaction.reply({
        content: "Sorry, there was an error during your sign-up. We're looking into it!",
        flags: MessageFlags.Ephemeral,
    });
    await adminChannel.send(
        `${adminMessage}
                Discord user: ${interaction.user.username}
                PS username: ${interaction.options.getString('ps_username')}`
    );
}

export async function findTournamentFromChannelId(interaction: ChatInputCommandInteraction): Promise<TournamentResponse | undefined> {
    try {
        const tournament = await axios.get(apiConfig.baseUrl + apiConfig.tournamentsEndpoint + `?signup_snowflake=${interaction.channel?.id}`);
        return tournament.data[0];
    } catch (error) {
        await interaction.reply({
            content: "No tournament found in this channel.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
}
