import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    MessageFlags,
    TextChannel,
    GuildMember,
    Snowflake
} from "discord.js";
import {
    PlayerDto,
    PlayerEntity,
    TournamentEntity, TournamentResponse,
    transformTournamentResponse
} from "@fullrestore/service";
import {apiConfig, playerRepo} from "../../repositories.js";
import axios, {AxiosError, AxiosResponse} from "axios";
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
            const tournamentResponse = await findTournamentBySignupSnowflake(interaction);
            if (!tournamentResponse) {
                await interaction.reply({
                    content: "No tournament found in this channel.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            await createEntrantPlayer(interaction, tournamentResponse);
            await (interaction.member as GuildMember).roles.add(tournamentResponse.role_snowflake as Snowflake);
            await interaction.reply(`${interaction.user} has signed up: Showdown username '${interaction.options.getString('ps_username')}'`);
        } catch (error) {
            throw error;
        }
    }
};

async function createEntrantPlayer(interaction: ChatInputCommandInteraction, tournamentResponse: TournamentResponse) {

    const tournament = transformTournamentResponse(tournamentResponse);
    const player: PlayerEntity = await initPlayer(interaction, tournament);
    try {
        await playerRepo.createEntrantPlayer(player, tournament);
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
        const playerResponse = await axios.post(
            apiConfig.baseUrl + apiConfig.playersEndpoint, player
        );
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
    let existingPsUser: AxiosResponse | undefined;
    try {
        existingPsUser = await axios.get(
            apiConfig.baseUrl + apiConfig.playersEndpoint + `?ps_user=${player.ps_user}`
        );
    } catch (error) {}
    try {
        const existingPlayer = await axios.get(
            apiConfig.baseUrl + apiConfig.playersEndpoint + `?discord_user=${player.discord_user}`
        );
        if (existingPsUser &&
            existingPsUser.data &&
            existingPsUser.data.discord_user &&
            (existingPlayer.data.discord_user !== existingPsUser.data.discord_user)
        ) {
            throw new Error(
                `Error on findExistingPlayer: ${interaction.user} is attempting to register with a taken Showdown account.
                PS user: ${player.ps_user}
                Discord account this belongs to: ${existingPsUser.data.discord_user}`
            );
        }
        if (!existingPlayer.data.discord_id) {
            await axios.put(
                apiConfig.baseUrl + apiConfig.playersEndpoint + '/' + existingPlayer.data.id, {
                    ps_user: existingPlayer.data.ps_user,
                    discord_user: interaction.user.username,
                    discord_id: interaction.user.id,
                }
            );
        }
        return {
            ...existingPlayer.data,
            discord_id: interaction.user.id,
        };
    } catch (error) {
        if (error instanceof AxiosError) {
            switch (error.response?.status) {
                case 404:
                    try {
                        const existingPlayer = await axios.get(
                            apiConfig.baseUrl + apiConfig.playersEndpoint + `?ps_user=${player.ps_user}`
                        );
                        await axios.put(
                            apiConfig.baseUrl + apiConfig.playersEndpoint + '/' + existingPlayer.data.id, {
                                ps_user: existingPlayer.data.ps_user,
                                discord_user: interaction.user.username,
                                discord_id: interaction.user.id,
                            }
                        );
                        return {
                            ...existingPlayer.data,
                            discord_user: interaction.user.username,
                            discord_id: interaction.user.id,
                        };
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
            `Error on findExistingPlayer: ${interaction.user} signup failed
            Message: ${error.message}`
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

export async function findTournamentBySignupSnowflake(interaction: ChatInputCommandInteraction): Promise<TournamentResponse | undefined> {
    try {
        const tournament = await axios.get(
            apiConfig.baseUrl + apiConfig.tournamentsEndpoint + `?signup_snowflake=${interaction.channel?.id}`
        );
        return tournament.data[0];
    } catch (error) {
        await interaction.reply({
            content: "No tournament found in this channel.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
}
