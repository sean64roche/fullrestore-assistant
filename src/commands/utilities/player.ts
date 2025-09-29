import {
    ChatInputCommandInteraction,
    GuildMember,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    Snowflake,
    TextChannel,
    userMention
} from "discord.js";

import {
    EntrantPlayerResponse,
    PlayerDto,
    TournamentResponse,
    transformEntrantPlayerResponse
} from "@fullrestore/service";

import {createEntrantPlayer} from "./in.js";
import {channels} from "../../globals.js";
import {DiscordPlayer, removeEntrantPlayer} from "./out.js";
import {apiConfig} from "../../repositories.js";
import axios, {AxiosResponse} from "axios";
import {findTournamentByAdminSnowflake} from "./tournament.js";
import {getRound} from "./round.js";
import {getEntrantPlayer} from "./pairing.js";

export const PLAYER_COMMAND = {
    data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Commands for handling players.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addSubcommand(subcommand =>
        subcommand
            .setName('signup')
            .setDescription('Adds a player to the tournament hosted in this channel.')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Player to sign-up')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('ps_username')
                .setDescription('Player\'s Pokemon Showdown username.')
                .setRequired(true)
            ),
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Removes a signed-up player from this tournament.')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Player to remove')
                    .setRequired(true)
        ),
    )
    .addSubcommand(subcommand =>
    subcommand
        .setName('list')
        .setDescription('List of all players signed up for this tournament.')
    )
    .addSubcommand(subcommand =>
    subcommand
    .setName('add-bye')
    .setDescription('Award proxy win to a player who doesn\'t have an opponent')
        .addIntegerOption(option =>
        option.setName('round')
            .setDescription('Round to award bye on')
            .setRequired(true)
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Player to award bye')
                .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove-bye')
            .setDescription('remove bye / proxy win from player, if they have one')
            .addIntegerOption(option =>
                option.setName('round')
                    .setDescription('Round to remove bye on')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Player to remove bye')
                    .setRequired(true)
            )
    ),
    async execute(interaction: ChatInputCommandInteraction) {
        let tournamentResponse;
        tournamentResponse = await findTournamentByAdminSnowflake(interaction);
        const playerMember = interaction.options.getMember('user');
        let subcommand = interaction.options.getSubcommand();
        if (subcommand === 'signup') {
            if (!tournamentResponse) {
                await interaction.reply({
                    content: "No tournament found in this channel.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            const player: PlayerDto = {
                ps_user: interaction.options.getString('ps_username')!,
                discord_user: interaction.options.getUser('user')!.username,
                discord_id: interaction.options.getUser('user')!.id,
            }
            await createEntrantPlayer(interaction, player, tournamentResponse);
            await interaction.reply(`${playerMember} has signed up: Showdown username '${interaction.options.getString('ps_username')}'`);
            await (playerMember as GuildMember).roles.add(tournamentResponse.role_snowflake as Snowflake);
            return;
        } else if (subcommand === 'remove') {
            if (!tournamentResponse) {
                tournamentResponse = await findTournamentByAdminSnowflake(interaction);
            }
            if (!tournamentResponse) {
                await interaction.reply({
                    content: "No tournament found in this channel.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            const discordPlayer: DiscordPlayer = {
                discordUser: interaction.options.getUser('user')!.username,
                discordId: interaction.options.getUser('user')!.id,
            };
            await removeEntrantPlayer(interaction, discordPlayer, tournamentResponse);
            try {
                await (playerMember as GuildMember).roles.remove(tournamentResponse.role_snowflake as Snowflake);
            } catch {
            }
            await interaction.reply(`Sign-up ${userMention(discordPlayer.discordId)} removed.`);
            return;
        } else if (subcommand === 'list') {
            tournamentResponse = await findTournamentByAdminSnowflake(interaction);
            if (!tournamentResponse) {
                await interaction.reply({
                    content: "No tournament found in this channel.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            try {
                const entrants: AxiosResponse = await axios.get(
                    apiConfig.baseUrl + apiConfig.tournamentsEndpoint + '/' + tournamentResponse.slug + '/entrants'
                );
                await interaction.reply(`Total entrants: ${entrants.data.length.toString()}`);
                await listTournamentEntrants(entrants.data, interaction);
            } catch (error) {
                await interaction.reply(
                    `Error on fetching entrants: 
                        ${error.message}`
                );
            }
        } else if (subcommand === 'add-bye') {
            if (!tournamentResponse) {
                await interaction.reply({
                    content: "No tournament found in this channel.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            await interaction.reply({
                content: `Assigning bye to ${playerMember}...`,
            });
            await createPlayerBye(interaction, tournamentResponse);
            await interaction.followUp({
                content: `Bye successfully added on Round ${interaction.options.getInteger('round')!} for ${playerMember}`,
            });
        } else if (subcommand === 'remove-bye') {
            if (!tournamentResponse) {
                await interaction.reply({
                    content: "No tournament found in this channel.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            await interaction.reply({
                content: `Removing bye from ${playerMember}...`,
            });
            await removePlayerBye(interaction, tournamentResponse);
            await interaction.followUp({
                content: `Bye successfully removed on Round ${interaction.options.getInteger('round')!} from ${playerMember}`,
            });
        }
    }
}

async function listTournamentEntrants(
    entrants: EntrantPlayerResponse[],
    interaction: ChatInputCommandInteraction
) {
    let i = 0;
    while (i < entrants.length) {
        const entrantsToSend = entrants.slice(i, i + 49);
        let buf = '';
        const botChannel = channels.cache.get(process.env.BOT_STUFF as Snowflake) as TextChannel;
        try {
            for (const entrant of entrantsToSend) {
                const entrantEntity = transformEntrantPlayerResponse(entrant);
                if (!!entrantEntity.player.discordId) {
                    buf += (`${userMention(entrantEntity.player.discordId)}\n`);
                } else {
                    buf += (entrantEntity.player.psUser + '\n');
                }
            }
            await botChannel.send({
                content: buf,
                allowedMentions: { parse: [] },
            });
            i += 50;
        } catch (e) {
            await interaction.followUp(
        `Error on listing entrants: 
                ${JSON.stringify(e.response?.data || e.message)}`
            );
            return;
        }
    }
}

async function createPlayerBye(interaction: ChatInputCommandInteraction, tournament: TournamentResponse) {
    const roundNumber = interaction.options.getInteger('round')!;
    const userId = interaction.options.getUser('user')!.id;
    const round = await getRound(interaction, tournament.slug, roundNumber);
    const entrant = await getEntrantPlayer(interaction, tournament.slug, userId);
    try {
        await axios.post(apiConfig.baseUrl + apiConfig.roundByesEndpoint, {
            round_id: round.id,
            entrant_player_id: entrant.id,
        });
    } catch (e) {
        await interaction.followUp(
            `Error on creating bye: 
                ${JSON.stringify(e.response?.data || e.message)}`
        );
        return;
    }
}

async function removePlayerBye(interaction: ChatInputCommandInteraction, tournament: TournamentResponse) {
    const roundNumber = interaction.options.getInteger('round')!;
    const userId = interaction.options.getUser('user')!.id;
    const round = await getRound(interaction, tournament.slug, roundNumber);
    const entrant = await getEntrantPlayer(interaction, tournament.slug, userId);
    try {
        const byeResponse = await axios.get(
            apiConfig.baseUrl + apiConfig.roundByesEndpoint +`?round_id=${round.id}&entrant_player_id=${entrant.id}`
        );
        await axios.delete(apiConfig.baseUrl + apiConfig.roundByesEndpoint + `/${byeResponse.data[0].id}`);
    } catch (e) {
        await interaction.followUp(
            `Error on deleting bye: 
                ${JSON.stringify(e.response?.data || e.message)}`
        );
        return;
    }
}
// export async function findTournamentByCategorySnowflake(interaction: ChatInputCommandInteraction): Promise<TournamentResponse | undefined> {
//
// }