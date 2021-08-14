require('dotenv').config();
const { joinVoiceChannel, entersState, VoiceConnectionStatus, createAudioResource, StreamType, createAudioPlayer, AudioPlayerStatus, NoSubscriberBehavior, generateDependencyReport } = require("@discordjs/voice");
console.log(generateDependencyReport());
const Discord = require("discord.js");
const client = new Discord.Client({
    intents: Discord.Intents.FLAGS.GUILDS | Discord.Intents.FLAGS.GUILD_VOICE_STATES
});
async function play(interaction) {
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.member.id);
    const memberVC = member.voice.channel;
    if (!memberVC) {
        return interaction.reply({
            content: "接続先のVCが見つかりません。",
            ephemeral: true,
        });
    }
    if (!memberVC.joinable) {
        return interaction.reply({
            content: "VCに接続できません。",
            ephemeral: true,
        });
    }
    if (!memberVC.speakable) {
        return interaction.reply({
            content: "VCで音声を再生する権限がありません。",
            ephemeral: true,
        });
    }

    const status = ["●Loading Sounds...", `●Connecting to ${memberVC}...`];
    const p = interaction.reply(status.join("\n"));
    const connection = joinVoiceChannel({
        guildId: guild.id,
        channelId: memberVC.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfMute: false,
    });
    // Extract the video URL from the command
    const StreamKey = interaction.options.get('streamkey').value;
    const resource = createAudioResource("rtsp://topaz.chat/live/" + StreamKey,
        {
            inputType: StreamType.Arbitrary,
        });
    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Pause,
        },
    });
    player.play(resource);
    console.log(StreamKey + " is playing!");
    const promises = [];

    promises.push(entersState(connection, VoiceConnectionStatus.Ready, 1000 * 10).then(() => status[0] += "Done!"));
    promises.push(entersState(player, AudioPlayerStatus.AutoPaused, 1000 * 10).then(() => status[1] += "Done!"));
    await Promise.race(promises);
    await p;
    await Promise.all([...promises, interaction.editReply(status.join("\n"))]);
    connection.subscribe(player);
    await entersState(player, AudioPlayerStatus.Playing, 100);

    await interaction.editReply("Playing " + StreamKey);
    await entersState(player, AudioPlayerStatus.Idle, 2 ** 31 - 1);
    await interaction.editReply("End");
    connection.destroy();

    async function stop(interaction) {
        player.stop();
        console.log(StreamKey + " is stopped!");
        await interaction.editReply("Stopped " + StreamKey);
    }
}
/**
 *
 * @param {Discord.CommandInteraction} interaction
 */
async function onPlay(interaction) {
    try {
        await play(interaction);
    } catch (err) {
        if (interaction.replied) {
            interaction.editReply("エラーが発生しました。").catch(() => { });
        } else {
            interaction.reply("エラーが発生しました。").catch(() => { });
        }
        throw err;
    }
}
/**
 *
 * @param {Discord.CommandInteraction} interaction
 */
async function onCommandInteraction(interaction) {
    if (interaction.commandName === "play") {
        return onPlay(interaction);
    }
}
/**
 *
 * @param {Discord.Interaction} interaction
 */
async function onInteraction(interaction) {
    if (interaction.isCommand()) {
        return onCommandInteraction(interaction);
    }
}
client.on("interactionCreate", interaction => onInteraction(interaction).catch(err => console.error(err)));
console.log('TopazBot client ready...');
client.login(process.env.DISCORD_TOKEN)