import {
    ChatInputCommandInteraction,
    GuildMember,
    MessageFlags, PermissionFlagsBits,
    SlashCommandBuilder, Snowflake, TextChannel, userMention
} from "discord.js";
import {
    EntrantPlayerResponse,
    PlayerDto,
    TournamentResponse,
    transformEntrantPlayerResponse
} from "@fullrestore/service";
import {createEntrantPlayer, findTournamentByAdminSnowflake, findTournamentBySignupSnowflake} from "./in.js";
import {channels} from "../../globals.js";
import {DiscordPlayer, removeEntrantPlayer} from "./out.js";
import {apiConfig} from "../../repositories.js";
import axios, {AxiosResponse} from "axios";

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
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        let tournamentResponse;
        tournamentResponse = await findTournamentBySignupSnowflake(interaction);
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
                await listTournamentEntrants(tournamentResponse, entrants.data, interaction);
            } catch (error) {
                await interaction.reply(
                    `Error on fetching entrants: 
                        ${error.message}`
                );
            }
        }
    }
}

async function listTournamentEntrants(
    tournament: TournamentResponse,
    entrants: EntrantPlayerResponse[],
    interaction: ChatInputCommandInteraction
) {
    let i = 0;
    while (i < entrants.length) {
        const entrantsToSend = entrants.slice(i, i + 99);
        let buf = '';
        try {
            const botChannel = channels.cache.get(process.env.BOT_STUFF as Snowflake) as TextChannel;
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
            i += 100;
        } catch (error) {
            await interaction.followUp(
                `Error on listing entrants: 
                        ${error.message}`
            );
            return;
        }
    }
}
