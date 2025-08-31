import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    MessageFlags,
    TextChannel,
    GuildMember,
    Snowflake
} from "discord.js";
import {
    cleanPsUsername,
    PlayerDto,
    PlayerEntity, PlayerResponse,
    TournamentEntity, TournamentResponse, transformPlayerResponse,
    transformTournamentResponse
} from "@fullrestore/service";
import {apiConfig, playerRepo} from "../../repositories.js";
import axios, {AxiosError, AxiosResponse} from "axios";
import {channels, revivalGuild} from "../../globals.js";
import {findTournamentBySignupSnowflake} from "./tournament.js";

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
            const player: PlayerDto = {
                ps_user: interaction.options.getString('ps_username')!,
                discord_user: interaction.user.username,
                discord_id: interaction.user.id,
            }
            await createEntrantPlayer(interaction, player, tournamentResponse);
            await interaction.reply(`${interaction.user} has signed up: Showdown username '${interaction.options.getString('ps_username')}'`);
            await (interaction.member as GuildMember).roles.add(tournamentResponse.role_snowflake as Snowflake);
        } catch (error) {
            if (error.status === 409) {
                return;
            }
            throw error;
        }
    }
};

export async function createEntrantPlayer(interaction: ChatInputCommandInteraction, player: PlayerDto, tournamentResponse: TournamentResponse) {

    const tournament = transformTournamentResponse(tournamentResponse);
    const playerEntity: PlayerEntity = await initPlayer(interaction, player, tournament);
    try {
        await playerRepo.createEntrantPlayer(playerEntity, tournament);
        return;
    } catch (error) {
        switch (error.status) {
            case 409:
                await interaction.reply({
                    content: "You're already signed up for this tournament!",
                    flags: MessageFlags.Ephemeral,
                });
                throw error;
            default:
                await produceError(
                    interaction,
                    await channels.fetch(tournament.adminSnowflake as Snowflake) as TextChannel,
                    `Unknown error on createEntrantPlayer: ${interaction.user} signup failed.
                    Message: ${error.message}`
                );
                break;
        }
    }
}

async function initPlayer(interaction: ChatInputCommandInteraction, player: PlayerDto, tournament: TournamentEntity): Promise<PlayerEntity> {
    try {
        const playerResponse = await axios.post(
            apiConfig.baseUrl + apiConfig.playersEndpoint, player
        );
        return playerResponse.data;
    } catch (error) {
        const adminChannel = await channels.fetch(tournament.adminSnowflake as Snowflake) as TextChannel;
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
                `Unknown error on initPlayer: ${await revivalGuild.members.fetch(player.discord_id!)} signup failed.
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
            apiConfig.baseUrl + apiConfig.playersEndpoint + `?player=${player.ps_user}`
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
                `Error on findExistingPlayer: ${await revivalGuild.members.fetch(player.discord_id!)} is attempting to register with a taken Showdown account.
                PS user: ${player.ps_user}
                Discord account this belongs to: ${existingPsUser.data.discord_user}`
            );
        }
        if (!existingPlayer.data.discord_id) {
            await axios.put(
                apiConfig.baseUrl + apiConfig.playersEndpoint + '/' + existingPlayer.data.id, {
                    ps_user: existingPlayer.data.ps_user,
                    discord_user: player.discord_user,
                    discord_id: player.discord_id,
                }
            );
        }
        await createNewAlias(player, existingPlayer.data);
        return {
            ...existingPlayer.data,
            discord_id: player.discord_id,
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
                                discord_user: player.discord_user,
                                discord_id: player.discord_id,
                            }
                        );
                        await createNewAlias(player, existingPlayer.data);
                        return {
                            ...existingPlayer.data,
                            discord_user: player.discord_user,
                            discord_id: player.discord_id,
                        };
                    } catch (error) {
                        await produceError(
                            interaction,
                            adminChannel,
                            `Error on findExistingPlayer: ${await revivalGuild.members.fetch(player.discord_id!)} duplicate detected but not found.`
                        );
                        throw error;
                    }
                default:
                    await produceError(
                        interaction,
                        adminChannel,
                        `Error on findExistingPlayer: ${await revivalGuild.members.fetch(player.discord_id!)}
                        Message: ${JSON.stringify(error.message)}`
                    );
                    throw error;
            }
        }
        await produceError(
            interaction,
            adminChannel,
            `Error on findExistingPlayer: ${await revivalGuild.members.fetch(player.discord_id!)} signup failed
            Message: ${error.message}`
        );
        throw error;
    }
}

async function createNewAlias(signupPlayer: PlayerDto, existingPlayer: PlayerResponse) {
    const existingAlias = await playerRepo.findPlayer(signupPlayer.ps_user);
    if (!existingAlias && existingPlayer.ps_user !== cleanPsUsername(signupPlayer.ps_user)) {
        await playerRepo.createPlayerAlias(transformPlayerResponse(existingPlayer), signupPlayer.ps_user);
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


