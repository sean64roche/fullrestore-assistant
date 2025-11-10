import {ChatInputCommandInteraction, Role, TextChannel, TextThreadChannel, User} from "discord.js";
import {revivalGuild} from "../globals.js";

export async function createNewPairingThread(
    interaction: ChatInputCommandInteraction,
    parentChannel: TextChannel,
    leftPlayer: User,
    rightPlayer: User,
    poolRole: Role,
    moderator: User,
    deadline: string
) {
    const leftPlayerUser = await revivalGuild.members.fetch(leftPlayer.id);
    const rightPlayerUser = await revivalGuild.members.fetch(rightPlayer.id);
    await leftPlayerUser.roles.add(poolRole);
    await rightPlayerUser.roles.add(poolRole);
    try {
        const threadName: string = leftPlayer.username + " vs. " + rightPlayer.username;
        const thread = await parentChannel.threads.create({
            name: threadName,
        }) as TextThreadChannel;
        await thread.send(`${leftPlayer} vs. ${rightPlayer}\n\n` +
            `Please schedule in this thread. Your pool moderator is ${moderator}, please upload all replays in this thread.\n` +
            `The round ends ${deadline}, all games must be played by then. Good luck and have fun!`
        );
        // await thread.send(`(if you have previously played each other, please notify your pool moderator)`);
    } catch (e) {
        await (interaction.channel as TextChannel).send(
            `Error on creating pairing thread: ${JSON.stringify(e.response?.data || e.message)}`
        );
        await leftPlayerUser.roles.remove(poolRole);
        await rightPlayerUser.roles.remove(poolRole);
    }
}