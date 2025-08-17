import {ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder,} from "discord.js";
import { tournamentRepo } from "../../repositories.js";
import { TournamentDto } from "@fullrestore/service";

export const TOURNAMENT_COMMAND = {
    data: new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('Commands for interacting with tournament data.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addSubcommand(subcommand =>
        subcommand
            .setName('init')
            .setDescription('Creates a new tournament.')
            .addStringOption(option =>
                option.setName('name')
                .setDescription('Name of the tournament')
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('format')
                .setDescription('Tournament format, e.g. gen3ou')
                .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('best-of')
                .setDescription('Expected number of matches in a full set, e.g. best of 5 = first to 3 wins')
                .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('elimination')
                    .setDescription('Number of losses required to be eliminated')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('start-date')
                .setDescription('Start date of the tournament')
                .setRequired(true)
            )
            .addChannelOption(option =>
                option.setName('admin-channel')
                    .setDescription('Channel where players will sign-up as an entrant')
                    .setRequired(true)
            )
            .addRoleOption(option =>
                option.setName('player_role')
                .setDescription('Assigned player role for entrants. If this doesn\'t exist, create one')
                .setRequired(true)
            )
            .addChannelOption(option =>
                option.setName('signup-channel')
                .setDescription('Channel where players will sign-up as an entrant')
                .setRequired(false)
            )
            .addChannelOption(option =>
                option.setName('result-channel')
                .setDescription('Channel which results are posted')
                .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('finish-date')
                .setDescription('Finish date of the tournament')
                .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('signup-start-date')
                .setDescription('Start date for sign-ups')
                .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('signup-finish-date')
                    .setDescription('Finish date for sign-ups')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('info')
                .setDescription('Freeform text for a description of tournament')
                .setRequired(false)
            )
    ),
    async execute(interaction: ChatInputCommandInteraction) {
        switch (interaction.options.getSubcommand()) {
            case 'init':
                try {
                    const newTournament = await createTournament(interaction);
                    const adminChannel = interaction.options.getChannel('admin-channel');
                    const signupChannel = interaction.options.getChannel('signup-channel');
                    const resultChannel = interaction.options.getChannel('result-channel');
                    const playerRole = interaction.options.getRole('player_role');
                    await interaction.reply(`Tournament created!
                    Name: ${newTournament.name}
                    Format: ${newTournament.format}
                    Start date: ${newTournament.startDate}
                    Finish date: ${newTournament.finishDate}
                    Best of: ${newTournament.winnerFirstTo}
                    Elimination: ${newTournament.elimination}
                    Signup start date: ${newTournament.signupStartDate}
                    Signup finish date: ${newTournament.signupFinishDate}
                    Admin channel: ${adminChannel}
                    Signup channel: ${signupChannel}
                    Results channel: ${resultChannel}
                    Player role: ${playerRole}`);
                    if (!!newTournament.info) {
                        await interaction.followUp(`Info:\n\n${newTournament.info}`);
                    }
                } catch (error) {
                    throw error;
                }
                break;
        }
    }
};

async function createTournament(interaction: ChatInputCommandInteraction) {
    const tournament: TournamentDto = {
        name: interaction.options.getString('name')!,
        season: 1,
        format: interaction.options.getString('format')!,
        start_date: interaction.options.getString('start-date')!,
        finish_date: interaction.options.getString('finish-date')!,
        team_tour: false,
        info: interaction.options.getString('info') || undefined,
        winner_first_to: interaction.options.getInteger('best-of')!,
        elimination: interaction.options.getInteger('elimination')!,
        signup_start_date: interaction.options.getString('signup-start-date') || undefined,
        signup_finish_date: interaction.options.getString('signup-finish-date') || undefined,
        admin_snowflake: interaction.options.getChannel('admin-channel')?.id,
        signup_snowflake: interaction.options.getChannel('signup-channel')?.id,
        result_snowflake: interaction.options.getChannel('result-channel')?.id,
        role_snowflake: interaction.options.getRole('player_role')?.id,
    };
    try {
        return await tournamentRepo.create(tournament);
    } catch (error) {
        await interaction.reply(`API Endpoint Error: ${error.message}`);
        await interaction.followUp(`Sent payload: ${JSON.stringify(tournament)}`);
        throw error;
    }
}
