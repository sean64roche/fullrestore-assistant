import {
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder, TextChannel, ThreadChannel, userMention
} from "discord.js";
import {findTournamentByThreadCategorySnowflake} from "./tournament.js";
import {confirmAction} from "../../utils/confirmAction.js";
import {
    EntrantPlayerEntity,
    PairingEntity,
    RoundEntity,
    TournamentResponse, transformEntrantPlayerResponse,
    transformPairingResponse, transformRoundResponse
} from "@fullrestore/service";
import axios from "axios";
import {apiConfig} from "../../repositories.js";

export const PAIRING_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('pairing')
        .setDescription('Commands for modifying pairings.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addSubcommand(subCommand =>
            subCommand
            .setName('substitute')
            .setDescription('Change players in a pairing thread')
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
        const tournament = await findTournamentByThreadCategorySnowflake(interaction);
        if (!tournament) {
            await interaction.reply({
                content: `Error: no tournament found.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        const roundNumber = interaction.options.getInteger('round')!;
        switch (interaction.options.getSubcommand()) {
            case 'substitute':
                const oldPlayer = interaction.options.getUser('old_player')!.id;
                const newPlayer = interaction.options.getUser('new_player')!.id;
                if (!await confirmAction(
                        interaction,
                        `You are subbing out ${userMention(oldPlayer)}, and subbing in ${userMention(newPlayer)} for Round ${roundNumber}.`,
                        `${userMention(oldPlayer)} subbing out, ${userMention(newPlayer)} subbing in...`,
                        `Substitution canceled.`
                    )
                ) { return; }
                await substitutePlayers(interaction, tournament, roundNumber, oldPlayer, newPlayer);
        }
    }
}

async function substitutePlayers(
    interaction: ChatInputCommandInteraction,
    tournament: TournamentResponse,
    roundNumber: number,
    oldPlayerId: string,
    newPlayerId: string
) {
    let round: RoundEntity;
    let pairing: PairingEntity;
    let newEntrant: EntrantPlayerEntity;
    try {
        const roundResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.roundsEndpoint + `?tournament_slug=${tournament.slug}&round=${+roundNumber}`
        );
        round = transformRoundResponse(roundResponse.data[0]);
        const pairingResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.pairingsEndpoint + `?round_id=${roundResponse.data[0].id}&discord_id=${oldPlayerId}`
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
    try {
        const newEntrantResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.entrantPlayersEndpoint + `?tournament_slug=${tournament.slug}&discord_id=${newPlayerId}`
        );
        newEntrant = transformEntrantPlayerResponse(newEntrantResponse.data[0]);
    } catch (e) {
        const msg = `Error while fetching new entrant: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
    try {
        await axios.delete(apiConfig.baseUrl + apiConfig.pairingsEndpoint + `/${pairing.id}`);
    } catch (e) {
        const msg = `Error while deleting pairing: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
    try {
        const entrant1 = pairing.entrant1.player.discordId === oldPlayerId ? newEntrant : pairing.entrant1;
        const entrant2 = pairing.entrant2.player.discordId === oldPlayerId ? newEntrant : pairing.entrant2;
        await axios.post(apiConfig.baseUrl + apiConfig.pairingsEndpoint, {
            round_id: round.id,
            entrant1_id: entrant1.id,
            entrant2_id: entrant2.id,
        });
        await (interaction.channel as ThreadChannel).members.remove(oldPlayerId);
        await (interaction.channel as ThreadChannel).members.add(newPlayerId);
        await (interaction.channel as ThreadChannel).setName(
            `${entrant1.player.discordUser} vs. ${entrant2.player.discordUser}`
        );
        await (interaction.channel as TextChannel).send(
            `New pairing: ${userMention(entrant1.player.discordId!)} vs. ${userMention(entrant2.player.discordId!)}.\n` +
            `See the start of this channel for your pool moderator & round deadline.`
        );
    } catch (e) {
        const msg = `Error creating new pairing: ${JSON.stringify(e.response?.data || e.message)}`;
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