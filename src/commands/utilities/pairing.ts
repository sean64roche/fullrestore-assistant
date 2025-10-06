import {
    ChannelType,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits, Role,
    SlashCommandBuilder,
    TextChannel,
    ThreadChannel,
    userMention
} from "discord.js";
import {findTournamentByAdminSnowflake, findTournamentByThreadCategorySnowflake} from "./tournament.js";
import {confirmAction} from "../../utils/confirmAction.js";
import {
    PairingEntity,
    TournamentResponse,
    transformEntrantPlayerResponse,
    transformPairingResponse,
} from "@fullrestore/service";
import axios from "axios";
import {apiConfig} from "../../repositories.js";
import {createNewPairingThread} from "../../utils/threadManager.js";
import {getRound} from "./round.js";

export const PAIRING_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('pairing')
        .setDescription('Commands for modifying pairings.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addSubcommand(subcommand =>
            subcommand
            .setName('create')
            .setDescription('Create a new pairing. Run in admin channel.')
            .addIntegerOption(option =>
                option.setName('round')
                    .setDescription('Round number for this pairing')
                .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('player1')
                    .setDescription('Left-side player')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('player2')
                    .setDescription('Right-side player')
                    .setRequired(true)
            )
            .addChannelOption(option =>
                option.setName('pool')
                    .setDescription('Which pool to create scheduling thread')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            )
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('Corresponding role for the pool being filled')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('moderator')
                    .setDescription('Moderator of this pool')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('deadline')
                    .setDescription('Deadline for this round. Provide a Unix timestamp!')
                    .setRequired(true)
            )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('delete')
            .setDescription('Deletes a pairing. Run in admin channel.')
            .addIntegerOption(option =>
                option.setName('round')
                    .setDescription('Round number for this pairing')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('player1')
                    .setDescription('Left-side player')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('player2')
                    .setDescription('Right-side player')
                    .setRequired(true)
            )
        )
        .addSubcommand(subCommand =>
            subCommand
            .setName('substitute')
            .setDescription('Change players in a pairing thread. Run in corresponding thread.')
            .addIntegerOption(option =>
                option.setName('round')
                    .setDescription('Round which this pairing is in')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('old_player')
                    .setDescription('Player to be subbed out')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('new_player')
                    .setDescription('Player to be subbed in to this pairing')
                    .setRequired(true)
            )
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const roundNumber = interaction.options.getInteger('round')!;
        let tournament;
        switch (interaction.options.getSubcommand()) {
            case 'create':
                tournament = await findTournamentByAdminSnowflake(interaction);
                if (!tournament) {
                    await interaction.reply({
                        content: `Error: no tournament found.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                await interaction.reply({
                    content: `Creating pairing...`,
                    flags: MessageFlags.Ephemeral,
                });
                await createPairing(interaction, tournament, +roundNumber);
                await interaction.followUp({
                    content: "Done!",
                    flags: MessageFlags.Ephemeral,
                });
                break;
            case 'delete':
                tournament = await findTournamentByAdminSnowflake(interaction);
                if (!tournament) {
                    await interaction.reply({
                        content: `Error: no tournament found.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const player1 = interaction.options.getUser('player1')!;
                const player2 = interaction.options.getUser('player2')!;
                if (!await confirmAction(
                    interaction,
                    `You are deleting ${player1} vs. ${player2} for Round ${roundNumber}. Please confirm this is correct round.`,
                    `Deleting round ${roundNumber}: ${player1} vs. ${player2}...`,
                    `Deletion canceled.`
                )) { return; }
                await deletePairing(interaction, tournament, +roundNumber, player1.id, player2.id);
                await interaction.followUp(`Deleted pairing: round ${roundNumber}, ${player1} vs. ${player2}. Make sure the corresponding thread has been handled.`);
                break;
            case 'substitute':
                tournament = await findTournamentByThreadCategorySnowflake(interaction);
                if (!tournament) {
                    await interaction.reply({
                        content: `Error: no tournament found.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const oldPlayer = interaction.options.getUser('old_player')!;
                const newPlayer = interaction.options.getUser('new_player')!;
                if (!await confirmAction(
                        interaction,
                        `You are subbing out ${oldPlayer}, and subbing in ${newPlayer} for Round ${roundNumber}.`,
                        `${oldPlayer} subbing out, ${newPlayer} subbing in...`,
                        `Substitution canceled.`
                    )
                ) { return; }
                await substitutePlayers(interaction, tournament, roundNumber, oldPlayer.id, newPlayer.id);
                break;
        }
    }
}

async function createPairing(
    interaction: ChatInputCommandInteraction,
    tournament: TournamentResponse,
    roundNumber: number,
) {
    const round = await getRound(interaction, tournament.slug, roundNumber);
    try {
        const entrant1 = await getEntrantPlayer(interaction, tournament.slug, interaction.options.getUser('player1')!.id);
        const entrant2 = await getEntrantPlayer(interaction, tournament.slug, interaction.options.getUser('player2')!.id);
        await axios.post(apiConfig.baseUrl + apiConfig.pairingsEndpoint, {
            round_id: round.id,
            entrant1_id: entrant1.id,
            entrant2_id: entrant2.id,
        });
        await createNewPairingThread(
            interaction,
            interaction.options.getChannel('pool')!,
            interaction.options.getUser('player1')!,
            interaction.options.getUser('player2')!,
            interaction.options.getRole('role')! as Role,
            interaction.options.getUser('moderator')!,
            interaction.options.getString('deadline')!
        )
    } catch (e) {
        const msg = `Error creating pairing: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
}

async function deletePairing(
    interaction: ChatInputCommandInteraction,
    tournament: TournamentResponse,
    roundNumber: number,
    player1Id: string,
    player2Id: string,
) {
    let round, pairingToDelete;
    try {
        round = await getRound(interaction, tournament.slug, roundNumber);
        const pairingResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.pairingsEndpoint + `?round_id=${round.id}&discord_id=${player1Id}`
        );
        pairingToDelete = transformPairingResponse(pairingResponse.data[0]);
    } catch (e) {
        const msg = `Error on fetching pairing: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
    if (!!pairingToDelete.winner) {
        await interaction.followUp({
            content: `Result found on ${userMention(player1Id)} vs. ${userMention(player2Id)}. Check this is the correct match, and if it is, you must first use '/match undo' to remove the result.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    try {
        await axios.delete(
            apiConfig.baseUrl + apiConfig.pairingsEndpoint + `/${pairingToDelete.id}`
        );
    } catch (e) {
        const msg = `Error on delete pairing: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
}

async function substitutePlayers(
    interaction: ChatInputCommandInteraction,
    tournament: TournamentResponse,
    roundNumber: number,
    oldPlayerId: string,
    newPlayerId: string
) {
    const round = await getRound(interaction, tournament.slug, roundNumber);
    let pairing: PairingEntity;
    try {
        const pairingResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.pairingsEndpoint +
            `?round_id=${round.id}&discord_id=${oldPlayerId}`
        );
        pairing = transformPairingResponse(pairingResponse.data[0]);
        if (!!pairing.winner) {
            const entrant1Id = pairing.entrant1.player.discordId!;
            const entrant2Id = pairing.entrant2.player.discordId!;
            await interaction.followUp({
                content: `Result found on ${userMention(entrant1Id)} vs. ${userMention(entrant2Id)}. Check this is the correct match, and if it is, you must first use '/match undo' to remove the result.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
    } catch (e) {
        const msg = `Error while fetching pairing data: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
    const newEntrant = await getEntrantPlayer(interaction, tournament.slug, newPlayerId);
    try {
        await axios.delete(apiConfig.baseUrl + apiConfig.pairingsEndpoint + `/${pairing.id}`);
    } catch (e) {
        const msg = `Error while deleting pairing: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
    const entrant1 = pairing.entrant1.player.discordId === oldPlayerId ? newEntrant : pairing.entrant1;
    const entrant2 = pairing.entrant2.player.discordId === oldPlayerId ? newEntrant : pairing.entrant2;
    try {
        await axios.post(apiConfig.baseUrl + apiConfig.pairingsEndpoint, {
            round_id: round.id,
            entrant1_id: entrant1.id,
            entrant2_id: entrant2.id,
        });
    } catch (e) {
        const msg = `Error creating new pairing: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
    try {
        await (interaction.channel as ThreadChannel).members.remove(oldPlayerId);
        await (interaction.channel as ThreadChannel).members.add(newPlayerId);
        await (interaction.channel as ThreadChannel).setName(
            `${entrant1.player.discordUser} vs. ${entrant2.player.discordUser}`
        );
    } catch (e) {
        const msg = `Error modifying thread: ${JSON.stringify(e.response?.data || e.message)} - please manually adjust this thread's title & members.`;
        await produceError(interaction, msg);
        // don't throw
    } finally {
        await (interaction.channel as TextChannel).send(
            `New pairing: ${userMention(entrant1.player.discordId!)} vs. ${userMention(entrant2.player.discordId!)}.\n` +
            `See the start of this channel for your pool moderator & round deadline.`
        );
    }
}

export async function getEntrantPlayer(interaction: ChatInputCommandInteraction, tournamentSlug: string, playerDiscordId: string) {
    try {
        const newEntrantResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.entrantPlayersEndpoint + `?tournament_slug=${tournamentSlug}&discord_id=${playerDiscordId}`
        );
        return transformEntrantPlayerResponse(newEntrantResponse.data[0]);
    } catch (e) {
        const msg = `Error while fetching entrant: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
}

async function produceError(
    interaction: ChatInputCommandInteraction,
    adminMessage: string
) {
    await interaction.followUp({
        content: `There was an error: ${adminMessage}`,
        flags: MessageFlags.Ephemeral,
    });
}