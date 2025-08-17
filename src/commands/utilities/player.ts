import {
    ChatInputCommandInteraction,
    GuildMember,
    MessageFlags, PermissionFlagsBits,
    SlashCommandBuilder, Snowflake
} from "discord.js";
import {PlayerDto} from "@fullrestore/service";
import {createEntrantPlayer, findTournamentByAdminSnowflake, findTournamentBySignupSnowflake} from "./in.js";
import {revivalGuild} from "../../globals.js";
import {DiscordPlayer, removeEntrantPlayer} from "./out.js";

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
    ),
    async execute(interaction: ChatInputCommandInteraction) {
        let tournamentResponse;
        tournamentResponse = await findTournamentBySignupSnowflake(interaction);
        const discordPlayer: DiscordPlayer = {
            discordUser: interaction.options.getUser('user')!.username,
            discordId: interaction.options.getUser('user')!.id,
        };
        const playerMember = interaction.options.getMember('user');
        switch(interaction.options.getSubcommand()) {
            case 'signup':
                if (!tournamentResponse) {
                    await interaction.reply({
                        content: "No tournament found in this channel.",
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const player: PlayerDto = {
                    ps_user: interaction.options.getString('ps_username')!,
                    discord_user: discordPlayer.discordUser,
                    discord_id: discordPlayer.discordId,
                }
                await createEntrantPlayer(interaction, player, tournamentResponse);
                await interaction.reply(`${playerMember} has signed up: Showdown username '${interaction.options.getString('ps_username')}'`);
                await (playerMember as GuildMember).roles.add(tournamentResponse.role_snowflake as Snowflake);
                return;
            case 'remove':
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
                await removeEntrantPlayer(interaction, discordPlayer, tournamentResponse);
                try {
                    await (playerMember as GuildMember).roles.remove(tournamentResponse.role_snowflake as Snowflake);
                } catch {}
                await interaction.reply(`Sign-up ${await revivalGuild.members.fetch(discordPlayer.discordId)} removed.`);
                return;
        }
    }
}
