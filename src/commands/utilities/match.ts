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
    EntrantPlayerEntity,
    PairingEntity,
    ReplayResponse,
    RoundEntity,
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
                    await reportReplays(tournament, interaction);
                    await interaction.followUp(
                        `Result recorded.\n
                        Winner: ${winner}\n
                        Loser: ${loser}`
                    );
                    break;
                case 'activity':
                    await reportActivityWin(tournament, roundNumber, winner, loser);
                    break;
                case 'undo':
                    await undoReport(tournament, roundNumber, winner, loser);
                    break;
            }
        } catch (e) {
            // await produceError(interaction, e.message);
            return;
        }
    }
}

async function reportReplays(tournament: TournamentResponse, interaction: ChatInputCommandInteraction) {
    const roundNumber = interaction.options.getInteger('round')!;
    const player = interaction.options.getUser('winner')!;
    let round: RoundEntity;
    let entrantWinner: EntrantPlayerEntity;
    let pairing: PairingEntity;
    try {
        const roundResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.roundsEndpoint +
            `?tournament_slug=${tournament.slug}&round=${+roundNumber}`
        );
        round = transformRoundResponse(roundResponse.data[0]);
        const entrantWinnerResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.entrantPlayersEndpoint +
            `?tournament_slug=${round.tournament.slug}&discord_id=${player.id}`
        );
        entrantWinner = transformEntrantPlayerResponse(entrantWinnerResponse.data[0]);
        const pairingResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.pairingsEndpoint +
            `?round_id=${round.id}&discord_id=${player.id}`
        );
        pairing = transformPairingResponse(pairingResponse.data[0]);
    } catch (e: any) {
        const msg = `Error finding pairing: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg)
        throw e;
    }
    try {
        await axios.put(
            apiConfig.baseUrl + apiConfig.pairingsEndpoint + '/' + pairing.id,
            { winner_id: entrantWinner.id }
        );
    } catch (e: any) {
        const msg = `Error inserting winner: ${JSON.stringify(e.response?.data || e.message)}`;
        await produceError(interaction, msg)
        throw e;
    }
    const replayLinks: (string | null)[] = [];
    replayLinks.push(
        interaction.options.getString('replay1'),
        interaction.options.getString('replay2'),
        interaction.options.getString('replay3'),
        interaction.options.getString('replay4'),
        interaction.options.getString('replay5')
    );
    let replaysResponse: ReplayResponse[] = [];
    for (const url of replayLinks) {
        if (!!url) {
            try {
                const replayResponse = await axios.post(
                    apiConfig.baseUrl + apiConfig.replaysEndpoint, {
                    pairing_id: pairing.id,
                    url: url,
                    match_number: replayLinks.indexOf(url) + 1,
                });
                replaysResponse.push(replayResponse.data);
            } catch (e) {
                const msg = `Error uploading replays: ${JSON.stringify(e.response?.data || e.message)}`;
                await produceError(interaction, msg);
                throw e;
            }
        }
    }
    try {
        const resultsChannel = await channels.fetch(tournament.result_snowflake!);
        // @ts-ignore
        await resultsChannel!.send({
            embeds: [await makeReportEmbed(interaction, pairing, replaysResponse)],
            allowedMentions: { parse: [] },
        });
    } catch (e) {
        await produceError(interaction, `Error finding results channel: ${JSON.stringify(e.response?.data || e.message)}`);
        throw e;
    }
}

async function reportActivityWin(tournament: TournamentResponse, roundNumber: number, winner: User, loser: User) {

}

async function undoReport(tournament: TournamentResponse, roundNumber: number, winner: User, loser: User) {

}

async function makeReportEmbed(interaction: ChatInputCommandInteraction, pairing: PairingEntity, replays: ReplayResponse[] = []): Promise<EmbedBuilder> {
    const leftPlayerId = pairing.entrant1.player.discordId!;
    const rightPlayerId = pairing.entrant2.player.discordId!;
    const playerText = (playerId: string) => {
        return userMention(playerId);
    }

    const winnerOnLeft = async () => {
        if (interaction.options.getUser('winner')!.id === leftPlayerId) {
            return "⬅️ 🏆";
        } else if (interaction.options.getUser('winner')!.id === rightPlayerId) {
            return "🏆 ➡️";
        } else {
            const errorMsg = `This shouldn't be reachable. Contact me lmao`
            await produceError(interaction, errorMsg);
            throw new Error(errorMsg);
        }
    }

    const matchText =
        `https://fullrestore.me/match/${pairing.round.tournament.format}/${pairing.round.tournament.slug}/r${pairing.round.roundNumber}/${pairing.entrant1.player.psUser}-vs-${pairing.entrant2.player.psUser}`;

    return new EmbedBuilder()
        .setDescription(
            `${playerText(leftPlayerId)} ${spoiler(await winnerOnLeft())} ${playerText(rightPlayerId)}`
        )
        .setTitle(`${pairing.round.tournament.name}, Round ${pairing.round.roundNumber}: ${pairing.entrant1.player.username} vs. ${pairing.entrant2.player.username}`)
        .setURL(matchText);
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

