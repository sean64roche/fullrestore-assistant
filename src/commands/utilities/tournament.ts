import { SlashCommandBuilder } from "discord.js";
import { tournamentRepo } from "../../repositories.js";
import {AxiosError} from "axios";
import {TournamentDto} from "@fullrestore/service";

export const TOURNAMENT_COMMAND = {
    data: new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('Commands for interacting with tournament data.')
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
    async execute(interaction) {
        switch (interaction.options.getSubcommand()) {
            case 'init':
                try {
                    const newTournament = await createTournament(interaction);
                    await interaction.reply(`Tournament created!\n
                     Name: ${newTournament.name}\n
                     Format: ${newTournament.format}\n
                     Start date: ${newTournament.startDate}\n
                     Finish date: ${newTournament.finishDate}\n
                     Best of: ${newTournament.winnerFirstTo}\n
                     Elimination: ${newTournament.elimination}\n
                     Signup start date: ${newTournament.signupStartDate}\n
                     Signup finish date: ${newTournament.signupFinishDate}\n`);
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

async function createTournament(interaction) {
    const tournament: TournamentDto = {
        name: interaction.options.getString('name'),
        season: 1,
        format: interaction.options.getString('format'),
        start_date: interaction.options.getString('start-date'),
        finish_date: interaction.options.getString('finish-date'),
        team_tour: false,
        info: interaction.options.getString('info'),
        winner_first_to: interaction.options.getInteger('best-of'),
        elimination: interaction.options.getInteger('elimination'),
        signup_start_date: interaction.options.getString('signup-start-date'),
        signup_finish_date: interaction.options.getString('signup-finish-date'),
    };
    try {
        return await tournamentRepo.create(tournament);
    } catch (error) {
        await interaction.reply(`API Endpoint Error: ${error.message}`);
        await interaction.followUp(`Sent payload: ${JSON.stringify(tournament)}`);
        throw error;
    }
}
