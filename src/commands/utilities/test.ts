import {ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder} from 'discord.js';
import {findTournamentByThreadCategorySnowflake} from "./tournament.js";

export const TEST_COMMAND = {
        data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('My First Command :3')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction: ChatInputCommandInteraction) {
        const channel = interaction.channel;
        const tournament = await findTournamentByThreadCategorySnowflake(interaction);
        let categoryId: string;
        if (!!tournament && channel && channel.isTextBased() && 'parent' in channel && 'parentId' in channel.parent! && !!channel.parent.parentId) {
            categoryId = channel.parent.parentId;
            await interaction.reply(`Tournament: ${tournament.name}`);
        } else {
            await interaction.reply('No category found.');
        }
    }
};

