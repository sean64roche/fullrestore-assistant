import {ChannelType, ChatInputCommandInteraction, SlashCommandBuilder, TextChannel, time} from 'discord.js';
import { revivalGuild } from '../../globals.js'

export const ROUND_COMMAND = {
    data: new SlashCommandBuilder()
    .setName('round')
    .setDescription('Commands for handling pools.')
    .addSubcommand(subcommand =>
        subcommand
            .setName('pair')
            .setDescription('Assigns roles and pairs left users with right users.')
            .addChannelOption(option =>
                option.setName('pool')
                .setDescription('Which pool to handle')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
            .addRoleOption(option =>
                option.setName('role')
                .setDescription('Corresponding role for the pool being filled')
                .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('moderator')
                .setDescription('Moderator of this pool')
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('deadline')
                .setDescription('Deadline for this round. Provide a Unix timestamp!')
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('left')
                .setDescription('Players on the left-hand side of the pool, space-separated')
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('right')
                .setDescription('Players on the right-hand side of the pool, space-separated')
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('header')
                .setDescription('Optional header message for any freeform text to be sent before threads are posted')
            ),
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('resetroles')
            .setDescription('Remove all Pool-related roles from server members.')
    ),
    async execute(interaction: ChatInputCommandInteraction) {
        switch(interaction.options.getSubcommand()) {
            case 'pair':
                await pairPlayers(interaction);
                break;
            case 'resetroles':
                // await removePoolRoles(interaction);
                break;
        }
    }
}

const finalPoolMessage =
"A few details to remember:\n" +
"- Read #adv-revival-2-tournament-rules even if you're an experienced player. We have banned Ninjask, many items, and confusion/accuracy moves. Be clear on the ruleset!\n" +
"- Play all games on [Smogtours](https://smogtours.psim.us/), and **upload** your replays.\n" +
"- You must use the same account name throughout the tournament.\n" +
"- (NEW - MANDATORY) Post links in #live-matches and tag \'Tour Spectator\'.\n" +
"- The winner of the set is responsible for posting the replays in the scheduling channel. Please do not post replays in #live-matches. Please tell your pool moderator who the winner is.\n" +
"- You have until " + (time(new Date(new Date().getTime() + 129600000))) + " your time (36 hours total) to schedule. If you do not schedule before then, you will take an activity loss.\n"


async function pairPlayers(interaction: ChatInputCommandInteraction) {
    let buf = '';
    const pool = interaction.options.getChannel('pool')! as TextChannel;
    const poolRole = interaction.options.getRole('role')!;
    const moderator = interaction.options.getUser('moderator')!;
    const currentRound = interaction.options.getString('round')!;
    const deadline = interaction.options.getString('deadline')!;
    const leftPlayersId = interaction.options.getString('left')!.split(' ').reverse();
    const rightPlayersId = interaction.options.getString('right')!.split(' ').reverse();
    await interaction.reply(`Processing pairings in ${pool}.`);
    console.log(leftPlayersId);
    console.log(rightPlayersId);
    if (!!interaction.options.getString('header')) {
        pool.send(interaction.options.getString('header')!);
    }

    for (let i = 0; i < leftPlayersId.length; i++) {
        let leftPlayer;
        let rightPlayer;
        try {
        leftPlayer = await revivalGuild.members.fetch(leftPlayersId[i]);
        await leftPlayer.roles.add(poolRole);
        } catch (e) {
            processMissingPlayer(leftPlayersId[i], (leftPlayersId.length - i));
            continue;
        }
        try {
            rightPlayer = await revivalGuild.members.fetch(rightPlayersId[i]);
            await rightPlayer.roles.add(poolRole);
        } catch (e) {
            processMissingPlayer(rightPlayersId[i], (rightPlayersId.length - i));
            continue;
        }
        await pool.threads.create({
            name: leftPlayer.user.globalName + " vs " + rightPlayer.user.globalName,
            // autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        });
        const thisThread = pool.threads.cache.find((x: {
            name: string;
        }) => x.name === leftPlayer.user.globalName + " vs " + rightPlayer.user.globalName)!;
        await thisThread.send(`${leftPlayer} vs ${rightPlayer}\n\n` +
            `Please schedule in this thread. Your pool moderator is ${moderator}.\n` +
            `(NEW - MANDATORY) - tag the Tour Spectator role with your game link in the #live-matches channel. \n` +
            `The round ends ${deadline}. All games must be played by then. Good luck and have fun!`
        );
        console.log(leftPlayer + " vs " + rightPlayer);
    }
    await pool.send(`${poolRole}\n\n` + finalPoolMessage + `- The round ends ${deadline}. All games must be played by then.`)
    await interaction.followUp(buf + `Pairings submitted in ${pool}.`);

    async function processMissingPlayer(id: string, int: number) {
        buf += `Pairing #${int}: player ${id} not found.\n`;
    }
}
