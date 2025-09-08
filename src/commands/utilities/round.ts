import {
    channelMention,
    ChannelType,
    ChatInputCommandInteraction,
    codeBlock,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    Snowflake,
    TextChannel,
    userMention
} from 'discord.js';
import {channels, revivalGuild} from '../../globals.js'
import {
    EntrantPlayerEntity,
    EntrantPlayerResultResponse,
    PairingDto, PairingEntity, PairingResponse,
    RoundEntity,
    TournamentResponse,
    transformPairingResponse,
    transformRoundResponse,
    transformTournamentResponse
} from "@fullrestore/service";
import {findTournamentByAdminSnowflake} from "./tournament.js";
import {apiConfig, roundRepo} from "../../repositories.js";
import axios, {AxiosResponse} from "axios";
import {createNewPairingThread} from "../../utils/threadManager.js";

export const ROUND_COMMAND = {
    data: new SlashCommandBuilder()
    .setName('round')
    .setDescription('Commands for handling pools.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addSubcommand(subcommand =>
        subcommand
            .setName('pair')
            .setDescription('Assigns roles and pairs left users with right users.')
            .addChannelOption(option =>
                option.setName('pool')
                .setDescription('Which pool to handle')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
            .addIntegerOption(option =>
            option.setName('round')
                .setDescription('Round number')
                .setRequired(true)
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
            .addStringOption(option =>
                option.setName('left')
                .setDescription('Players on the left-hand side of the pool, space-separated')
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('right')
                .setDescription('Players on the right-hand side of the pool, space-separated')
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('header')
                .setDescription('Optional header message for any freeform text to be sent before threads are posted')
            ),

    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('init')
            .setDescription('Creates a new round in the db & on the website.')
            .addIntegerOption(option =>
                option.setName('number')
                    .setDescription('Round number')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('deadline')
                    .setDescription('End date-time of this round. Please enter in YYYY-MM-DD')
                    .setRequired(false)
            )
    )
        .addSubcommand(subCommand =>
        subCommand
            .setName('results')
            .setDescription('Returns a list of all results up to the given round.')
            .addIntegerOption(option =>
                option.setName('round')
                    .setDescription('Round number')
                    .setRequired(true)
            )
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        switch(interaction.options.getSubcommand()) {
            case 'pair':
                await pairPlayers(interaction);
                break;
            case 'init':
                await interaction.reply({
                    content: "Sending request...",
                    flags: MessageFlags.Ephemeral,
                });
                try {
                    const newRound = await createRound(interaction);
                    await interaction.followUp(`Round ${newRound.roundNumber} readied for ${newRound.tournament.name}.`);
                } catch (error) {
                    await produceError(interaction, JSON.stringify(error.response?.data));
                }
                break;
            case 'results':
                await interaction.reply({
                    content: "Fetching results...",
                    flags: MessageFlags.Ephemeral,
                });
                try {
                    const tournament = await findTournamentByAdminSnowflake(interaction);
                    if (!tournament) {
                        await interaction.reply({
                            content: `Error: no tournament found.`,
                            flags: MessageFlags.Ephemeral,
                        });
                        return;
                    }
                    await getRoundResults(interaction, tournament, interaction.options.getInteger('round')!);
                } catch (e) {
                    const msg = JSON.stringify(e.response?.data || e.message)
                    await produceError(interaction, msg);
                }
                break;
        }
    }
}

const finalPoolMessage =
"A few details to remember:\n" +
`- Read ${channelMention('1407086933137555618')}, even if you're an experienced player. We have banned Ninjask + Baton Pass, Smeargle + Baton Pass, many items, and confusion/accuracy moves. Be clear on the ruleset!
` +
"- Play all games on [Smogtours](https://smogtours.psim.us/), and **upload** your replays.\n" +
`- Post links in ${channelMention('1143739235543818341')} and tag 'Tour Spectator'.
` +
`- The winner of the set is responsible for posting the replays in your scheduling thread, please do not post replays in the live-matches channel. Please tell your pool moderator who the winner is.
` +
`Use the [Discord Timestamp Converter tool](https://sesh.fyi/timestamp/) where necessary to ease scheduling. It shows your local time in contrast to your opponent's local time.
` +
    `You can follow this round at [Full Restore Tournaments r2](https://fullrestore.me/tournament/adv-revival-2025:-swiss-stage/r2).` +
"- You have until the end of Friday (5 days total) to schedule. If you do not schedule before then, you risk taking an activity loss.\n"


async function pairPlayers(interaction: ChatInputCommandInteraction) {
    let buf = '';
    const pool = interaction.options.getChannel('pool')! as TextChannel;
    const poolRole = interaction.options.getRole('role')!;
    const moderator = interaction.options.getUser('moderator')!;
    const currentRound = interaction.options.getInteger('round')!;
    const deadline = interaction.options.getString('deadline')!;
    const leftPlayersId = interaction.options.getString('left')!.split(' ').reverse();
    const rightPlayersId = interaction.options.getString('right')!.split(' ').reverse();
    await interaction.reply(`Processing pairings in ${pool}.`);
    console.log(leftPlayersId);
    console.log(rightPlayersId);
    if (!!interaction.options.getString('header')) {
        await pool.send(interaction.options.getString('header')!);
    }
    const tournament = await findTournamentByAdminSnowflake(interaction);
    if (!tournament) {
        await interaction.followUp({
            content: "No tournament found in this channel.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    for (let i = 0; i < leftPlayersId.length; i++) {
        let round;
        let leftPlayer;
        let rightPlayer;
        try {
        leftPlayer = await revivalGuild.members.fetch(leftPlayersId[i]);
        await leftPlayer.roles.add(poolRole);
        } catch (e) {
            await processMissingPlayer(leftPlayersId[i], (leftPlayersId.length - i));
            continue;
        }
        try {
            rightPlayer = await revivalGuild.members.fetch(rightPlayersId[i]);
            await rightPlayer.roles.add(poolRole);
        } catch (e) {
            await processMissingPlayer(rightPlayersId[i], (rightPlayersId.length - i));
            continue;
        }
        let leftEntrantPlayer, rightEntrantPlayer;
        try {
            const roundResponse = await axios.get(
                apiConfig.baseUrl +  apiConfig.roundsEndpoint + `?tournament_slug=${tournament.slug}&round=${+currentRound}`,
            );
            const leftEntrantResponse = await axios.get(
                apiConfig.baseUrl + apiConfig.entrantPlayersEndpoint + `?tournament_slug=${tournament.slug}&discord_id=${leftPlayersId[i]}`,
            );
            const rightEntrantResponse = await axios.get(
                apiConfig.baseUrl + apiConfig.entrantPlayersEndpoint + `?tournament_slug=${tournament.slug}&discord_id=${rightPlayersId[i]}`,
            );
            round = roundResponse.data[0];
            leftEntrantPlayer = leftEntrantResponse.data[0];
            rightEntrantPlayer = rightEntrantResponse.data[0];
        } catch (e) {
            await produceError(interaction, `Bad information on gathering data for pairing: ${leftPlayer} vs. ${rightPlayer}`);
            continue;
        }
        try {
            const pairingDto: PairingDto = {
                round_id: round.id,
                entrant1_id: leftEntrantPlayer.id,
                entrant2_id: rightEntrantPlayer.id,
            }
            await axios.post(apiConfig.baseUrl + apiConfig.pairingsEndpoint, pairingDto);
        } catch (e) {
            await produceError(interaction, `Error uploading pairing to db: ${leftPlayer} vs. ${rightPlayer}`);
            throw e;
        }
        await createNewPairingThread(
            interaction,
            pool,
            leftPlayer.user,
            rightPlayer.user,
            moderator,
            deadline,
        );
    }
    await pool.send(`${poolRole}\n\n` + finalPoolMessage + `- The round ends ${deadline}. All games must be played by then.`)
    await interaction.followUp(buf + `Pairings submitted in ${pool}.`);

    async function processMissingPlayer(id: string, int: number) {
        buf += `Pairing #${int}: player ${userMention(id)} ${id} not found.\n`;
    }
    try {
        await axios.post((process.env.API_CLIENTURL ?? 'https://fullrestore.me') + '/api/rounds', {
            tournamentSlug: tournament?.slug,
            roundNumber: currentRound,
            action: 'warm',
        });
    } catch (e) {
        await produceError(interaction, `Error warming cache...`);
        throw e;
    }

}

export async function createRound(interaction: ChatInputCommandInteraction): Promise<RoundEntity> {
    try {
        const tournament = await findTournamentByAdminSnowflake(interaction);
        if (!tournament) {
            await produceError(interaction, `No tournament found in this channel.`);
            throw new Error('No tournament found in this channel.');
        }
        else {
            return await roundRepo.create(
                transformTournamentResponse(tournament),
                interaction.options.getInteger('number')!,
                undefined,
                interaction.options.getString('deadline') ?? undefined,
            );
        }
    } catch (error) {
        await produceError(interaction, JSON.stringify(error.response?.data));
        throw error;
    }
}

async function getRoundResults(interaction: ChatInputCommandInteraction, tournament: TournamentResponse, roundNumber: number) {
    const botChannel = channels.cache.get(process.env.BOT_STUFF as Snowflake) as TextChannel;
    const round = await getRound(interaction, tournament.slug, roundNumber);
    const pairingsResponse = await axios.get(
        apiConfig.baseUrl + apiConfig.pairingsEndpoint + `?round_id=${round.id}`
    );
    const pairings: PairingEntity[] = [];
    pairingsResponse.data.forEach(
        (pairing: PairingResponse) => pairings.push(transformPairingResponse(pairing))
    );
    await botChannel.send(`pairingsResponse size: ${pairingsResponse.data.length}`);
    const entrants: EntrantPlayerEntity[] = [];
    pairings.forEach(pairing => {
        entrants.push(pairing.entrant1);
        entrants.push(pairing.entrant2);
    });
    await botChannel.send(`entrants size: ${entrants.length}`);
    await botChannel.send(codeBlock(`discord_user | discord_id | wins\n------------------------------\n`));
    let i = 0;
    while (i < entrants.length) {
        const entrantsToSend = entrants.slice(i, i + 49);
        i += 50;
        let buf = '';
        for (const entrant of entrantsToSend) {
            try {
                const entrantWinsResponse: AxiosResponse<EntrantPlayerResultResponse> = await axios.get(
                    apiConfig.baseUrl + apiConfig.entrantPlayersEndpoint + `/${entrant.id}/wins?round=${roundNumber}`,
                );
                buf += `${entrant.player.discordUser},${entrant.player.discordId},${entrantWinsResponse.data.wins + entrantWinsResponse.data.byes}\n`;
            } catch (e) {
                await interaction.followUp(
                    `Error on listing entrant ${entrant.player.discordUser}: 
                    ${JSON.stringify(e.response?.data || e.message)}`
                );
        }
        await botChannel.send(codeBlock(buf));
        buf = '';
        }
    }
}

export async function getRound(interaction: ChatInputCommandInteraction, tournamentSlug: string, roundNumber: number) {
    try {
        const roundResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.roundsEndpoint + `?tournament_slug=${tournamentSlug}&round=${+roundNumber}`
        );
        return transformRoundResponse(roundResponse.data[0]);
    } catch (e) {
        const msg = `Error while fetching round: ${JSON.stringify(e.response?.data || e.message)}`;
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