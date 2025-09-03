import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    spoiler,
    User,
    userMention
} from "discord.js";
import {findTournamentByThreadCategorySnowflake} from "./tournament.js";
import {
    PairingEntity, PlayerEntity,
    TournamentResponse, transformEntrantPlayerResponse,
    transformPairingResponse,
    transformRoundResponse
} from "@fullrestore/service";
import axios from "axios";
import {apiConfig} from "../../repositories.js";
import {channels} from "../../globals.js";


export const MATCH_COMMAND = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('Commands for handling pairings and results.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addSubcommand(subCommand =>
            subCommand
            .setName('report')
            .setDescription('Record the winner and loser, and replay(s) of a pairing.')
            .addIntegerOption(option =>
                option.setName('round')
                    .setDescription('Round number for this pairing')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('winner')
                    .setDescription('Player who won the match')
                    .setRequired(true)
            )
            // technically redundant but helps reduce human error
            .addUserOption(option =>
                option.setName('loser')
                    .setDescription('Player who lost the match')
                    .setRequired(true)
            )
            .addStringOption(option =>
            option.setName('replay1')
                .setDescription('Game 1 replay URL')
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('replay2')
                    .setDescription('Game 2 replay URL')
            )
            .addStringOption(option =>
                option.setName('replay3')
                    .setDescription('Game 3 replay URL')
            )
            .addStringOption(option =>
                option.setName('replay4')
                    .setDescription('Game 4 replay URL')
            )
            .addStringOption(option =>
                option.setName('replay5')
                    .setDescription('Game 5 replay URL')
            )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('activity')
            .setDescription('Record the winner and loser of a pairing, no replays.')
            .addIntegerOption(option =>
                option.setName('round')
                    .setDescription('Round number for this pairing')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('winner')
                    .setDescription('Player who won the match')
                    .setRequired(true)
            )
            // technically redundant but helps reduce human error
                .addUserOption(option =>
                option.setName('loser')
                    .setDescription('Player who lost the match')
                    .setRequired(true)
            )
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('undo')
            .setDescription('Undo a match report (used for adjusting input mistakes).')
            .addIntegerOption(option =>
                option.setName('round')
                    .setDescription('Round number for this pairing')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('winner')
                    .setDescription('Player who won the match')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('loser')
                    .setDescription('Player who lost the match')
                    .setRequired(true)
            )
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        const tournament = await findTournamentByThreadCategorySnowflake(interaction);
        if (!tournament) {
            await interaction.reply({
                content: `Error: no tournament found.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        const roundNumber = interaction.options.getInteger('round')!;
        const winner = interaction.options.getUser('winner')!;
        const loser = interaction.options.getUser('loser')!;
        try {
            switch(interaction.options.getSubcommand()) {
                case 'report':
                    await interaction.reply({
                        content: `Uploading winner & replays...`,
                        flags: MessageFlags.Ephemeral,
                    });
                    const replays = await reportReplays(tournament, interaction);
                    const replayList = replays.filter((replay) => !!replay).join("\n");
                    await interaction.followUp(
                        `Result recorded.\nWinner: ${winner}\nLoser: ${loser}\nReplays:\n${replayList}`
                    );
                    break;
                case 'activity':
                    await interaction.reply({
                        content: `Recording activity win...`,
                        flags: MessageFlags.Ephemeral,
                    });
                    await reportActivityWin(interaction, tournament, roundNumber, winner, loser);
                    await interaction.followUp(
                        `Activity win recorded.\nWinner: ${winner}\nLoser: ${loser}`
                    );
                    break;
                case 'undo':
                    await interaction.reply({
                        content: `Undoing result...`,
                        flags: MessageFlags.Ephemeral,
                    });
                    await undoReport(interaction, tournament, roundNumber, winner, loser);
                    await interaction.followUp(
                        `Result undone for ${winner} vs ${loser}.`
                    );
                    break;
            }
        } catch (e) {
            // await produceError(interaction, e.message);
            return;
        }
        try {
            await axios.post((process.env.API_CLIENTURL ?? 'https://fullrestore.me') + '/api/rounds', {
                tournamentSlug: tournament?.slug,
                roundNumber: roundNumber,
                action: 'warm',
            });
        } catch (e) {
            await produceError(interaction, `Error warming cache...`);
            throw e;
        }
    }
}

async function reportReplays(tournament: TournamentResponse, interaction: ChatInputCommandInteraction) {
    const roundNumber = interaction.options.getInteger('round')!;
    const winner = interaction.options.getUser('winner')!;
    const loser = interaction.options.getUser('loser')!;
    const { entrantWinner, pairing } = await findPairingInfo(interaction, tournament, roundNumber, winner);
    await updatePairingWinner(interaction, pairing, entrantWinner.id);
    const replayLinks: (string | null)[] = [];
    replayLinks.push(
        interaction.options.getString('replay1'),
        interaction.options.getString('replay2'),
        interaction.options.getString('replay3'),
        interaction.options.getString('replay4'),
        interaction.options.getString('replay5')
    );
    for (const url of replayLinks) {
        if (!!url) {
            try {
                await axios.post(
                    apiConfig.baseUrl + apiConfig.replaysEndpoint, {
                    pairing_id: pairing.id,
                    url: url,
                    match_number: replayLinks.indexOf(url) + 1,
                });
            } catch (e) {
                const msg = `Error uploading replays: ${JSON.stringify(e.response?.data || e.message)}`;
                await undoReport(interaction, tournament, roundNumber, winner, loser);
                await produceError(interaction, msg);
                throw e;
            }
        }
    }
    try {
        const resultsChannel = await channels.fetch(tournament.result_snowflake!);
        // @ts-ignore
        await resultsChannel!.send({
            embeds: [await makeReportEmbed(interaction, pairing)],
            allowedMentions: { parse: [] },
        });
    } catch (e) {
        await produceError(interaction, `Error finding results channel: ${JSON.stringify(e.response?.data || e.message)}`);
        throw e;
    }
    return replayLinks;
}

async function reportActivityWin(interaction: ChatInputCommandInteraction, tournament: TournamentResponse, roundNumber: number, winner: User, loser: User) {
    const { entrantWinner, pairing } = await findPairingInfo(interaction, tournament, roundNumber, winner);
    try {
        const resultsChannel = await channels.fetch(tournament.result_snowflake!);
        const leftPlayerId = pairing.entrant1.player.discordId!;
        const rightPlayerId = pairing.entrant2.player.discordId!;
        await updatePairingWinner(interaction, pairing, entrantWinner.id);
        // @ts-ignore
        await resultsChannel!.send({
            content: `${userMention(leftPlayerId)}\n${await winnerSide(interaction, leftPlayerId, rightPlayerId)}\n${userMention(rightPlayerId)} on activity.`,
            allowedMentions: { parse: [] },
        });
        return;
    } catch (e) {
        await produceError(interaction, `Error posting in results channel: ${JSON.stringify(e.response?.data || e.message)}`);
        throw e;
    }
}

async function undoReport(interaction: ChatInputCommandInteraction, tournament: TournamentResponse, roundNumber: number, winner: User, loser: User) {
    const { pairing } = await findPairingInfo(interaction, tournament, roundNumber, winner);
    await updatePairingWinner(interaction, pairing, null);
    await deleteReplays(interaction, pairing.id);
    return;
}

async function findPairingInfo(interaction: ChatInputCommandInteraction, tournament: TournamentResponse, roundNumber: number, player: User) {
    try {
        const roundResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.roundsEndpoint +
            `?tournament_slug=${tournament.slug}&round=${+roundNumber}`
        );
        const round = transformRoundResponse(roundResponse.data[0]);
        const entrantWinnerResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.entrantPlayersEndpoint +
            `?tournament_slug=${round.tournament.slug}&discord_id=${player.id}`
        );
        const entrantWinner = transformEntrantPlayerResponse(entrantWinnerResponse.data[0]);
        const pairingResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.pairingsEndpoint +
            `?round_id=${round.id}&discord_id=${player.id}`
        );
        const pairing = transformPairingResponse(pairingResponse.data[0]);
        return { round, entrantWinner, pairing };
    } catch (e: any) {
        const msg = `Error finding pairing: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
}

async function updatePairingWinner(interaction: ChatInputCommandInteraction, pairing: PairingEntity, entrantWinnerId: string | null) {
    try {
        await axios.put(
            apiConfig.baseUrl + apiConfig.pairingsEndpoint + '/' + pairing.id,
            { winner_id: entrantWinnerId }
        );
    } catch (e: any) {
        const msg = `Error inserting winner: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
}

async function deleteReplays(interaction: ChatInputCommandInteraction, pairingId: string) {
    try {
        await axios.delete(apiConfig.baseUrl + apiConfig.replaysEndpoint + '/' + pairingId);
        return;
    } catch (e) {
        if (e.response.status === 404) {
            return;
        }
        const msg = `Error deleting replay: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg);
        throw e;
    }
}

async function makeReportEmbed(interaction: ChatInputCommandInteraction, pairing: PairingEntity): Promise<EmbedBuilder> {
    const leftPlayer: PlayerEntity = pairing.entrant1.player!;
    const rightPlayer: PlayerEntity = pairing.entrant2.player!;
    const winnerText = await winnerSide(interaction, leftPlayer.discordId!, rightPlayer.discordId!);
    const playerText = (player: PlayerEntity) => {
        return userMention(player.discordId!);
    }
    const matchText =
        `https://fullrestore.me/match/${pairing.round.tournament.format}/${pairing.round.tournament.slug}/r${pairing.round.roundNumber}/${pairing.entrant1.player.psUser}-vs-${pairing.entrant2.player.psUser}`;

    return new EmbedBuilder()
        .setDescription(
            `${playerText(leftPlayer)}\n${spoiler(winnerText)}\n${playerText(rightPlayer)}`
        )
        .setTitle(`${pairing.round.tournament.name}, Round ${pairing.round.roundNumber}: ${pairing.entrant1.player.username} vs. ${pairing.entrant2.player.username}`)
        .setURL(matchText);
}

async function winnerSide(interaction: ChatInputCommandInteraction, leftPlayerDiscordId: string, rightPlayerDiscordId: string): Promise<("⬆️\n🏆" | "🏆\n⬇️")> {
    if (interaction.options.getUser('winner')!.id === leftPlayerDiscordId) {
        return "⬆️\n🏆";
    } else if (interaction.options.getUser('winner')!.id === rightPlayerDiscordId) {
        return "🏆\n⬇️";
    } else {
        const msg = `This shouldn't be reachable. Contact me lmao`
        await produceError(interaction, msg);
        throw new Error(msg);
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

