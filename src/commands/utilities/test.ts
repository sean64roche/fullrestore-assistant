import { SlashCommandBuilder }  from 'discord.js';

export const TEST_COMMAND = {
        data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('My First Command :3'),
    async execute(interaction) {
        await interaction.reply('Successful. Cheers.');
    }
};
