import {ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder} from 'discord.js';

export const TEST_COMMAND = {
        data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('My First Command :3')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply('Successful. Cheers.');
    }
};

