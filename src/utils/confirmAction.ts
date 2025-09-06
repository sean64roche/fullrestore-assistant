import {ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, MessageFlags} from "discord.js";

export async function confirmAction(interaction: ChatInputCommandInteraction, prompt: string, confirmMessage: string, cancelMessage: string) {

    const cancelButton = new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger);
    const confirmButton = new ButtonBuilder().setCustomId('confirm').setLabel('Confirm').setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(confirmButton).addComponents(cancelButton);
    const response = await interaction.reply({
        content: prompt,
        // @ts-ignore
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const collectorFilter = (i: ChatInputCommandInteraction) => i.user.id === interaction.user.id;

    try {
        // @ts-ignore
        const confirmation = await response.awaitMessageComponent({ filter: collectorFilter, time: 60000 });

        if (confirmation.customId === 'confirm') {
            await confirmation.update({ content: confirmMessage, components: [] });
            return true;
        }
        else {
            await confirmation.update({ content: `Action canceled: ${cancelMessage}`, components: [] });
        }
    } catch (e) {
        await interaction.editReply({ content: 'Confirmation not received within 1 minute, cancelling', components: [] });
    }
    return false;
}