require('dotenv').config();
const { joinVoiceChannel, entersState, VoiceConnectionStatus, createAudioResource, StreamType, createAudioPlayer, AudioPlayerStatus, NoSubscriberBehavior, generateDependencyReport } = require("@discordjs/voice");
console.log(generateDependencyReport());
const Discord = require("discord.js");
const client = new Discord.Client({
    intents: Discord.Intents.FLAGS.GUILDS | Discord.Intents.FLAGS.GUILD_VOICE_STATES
});
var StreamKey = null;
let connection = null;
function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
async function play(interaction) {
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.member.id);
    const memberVC = member.voice.channel;
    if (!memberVC) {
        return interaction.reply({
            content: "Voice channel is not found to connect.",
            ephemeral: true,
        });
    }
    if (!memberVC.joinable) {
        return interaction.reply({
            content: "Voice channel is inaccessible.",
            ephemeral: true,
        });
    }
    if (!memberVC.speakable) {
        return interaction.reply({
            content: "Bot do not have permission to play audio in Voice channel.",
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
    if (StreamKey === null) { StreamKey = interaction.options.get('streamkey').value }
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
    await interaction.editReply("Stopped");
    console.log(StreamKey + " is stopped!");
    while (player.state.status === "idle") {
        await sleep(5000);
        if (!connection.state.networking.state.connectionData.speaking) {
            const resource = createAudioResource("rtsp://topaz.chat/live/" + StreamKey,
                {
                    inputType: StreamType.Arbitrary,
                });
            const player = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Pause,
                },
            });
            await interaction.editReply("Auto resuming...");
            console.log('Autoresume has started!');
            player.play(resource);
            connection.subscribe(player);
            await sleep(5000);
            if (connection.state.networking.state.connectionData.speaking) {
                await interaction.editReply("Autoresumed");
                console.log(StreamKey + " is Autoresumed!");
                await interaction.editReply("Playing " + StreamKey);
            }
        }
        continue;
    }
    return {
        connection: connection,
        StreamKey: StreamKey,

    };
}
/**
 *
 * @param {CommandInteraction} interaction
 */
async function resync(interaction) {
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.member.id);
    const memberVC = member.voice.channel;
    if (!memberVC) {
        return interaction.reply({
            content: "Voice channel is not found to connect.",
            ephemeral: true,
        });
    }
    if (!memberVC.joinable) {
        return interaction.reply({
            content: "Voice channel is inaccessible.",
            ephemeral: true,
        });
    }
    if (!memberVC.speakable) {
        return interaction.reply({
            content: "Bot do not have permission to play audio in Voice channel.",
            ephemeral: true,
        });
    }
    const status = ["●Reloading Sounds...", `●Reconnecting to ${memberVC}...`];
    const p = interaction.reply(status.join("\n"));
    if (!connection) {
        connection = joinVoiceChannel({
            guildId: guild.id,
            channelId: memberVC.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: false,
        });
    };
    const resource = createAudioResource("rtsp://topaz.chat/live/" + StreamKey,
        {
            inputType: StreamType.Arbitrary,
        });
    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Pause,
        },
    });
    console.log(StreamKey + " is resyncing...");
    player.play(resource);
    const promises = [];
    promises.push(entersState(connection, VoiceConnectionStatus.Ready, 1000 * 10).then(() => status[0] += "Done!"));
    promises.push(entersState(player, AudioPlayerStatus.AutoPaused, 1000 * 10).then(() => status[1] += "Done!"));
    await Promise.race(promises);
    await p;
    await Promise.all([...promises, interaction.editReply(status.join("\n"))]);
    connection.subscribe(player);
    await entersState(player, AudioPlayerStatus.Playing, 100);
    await interaction.editReply("Resynced");
    console.log(StreamKey + " is resynced!");
    await interaction.editReply("Playing " + StreamKey);
    await entersState(player, AudioPlayerStatus.Idle, 2 ** 31 - 1);
    await interaction.editReply("Stopped");
    console.log(StreamKey + " is stopped!");
    while (player.state.status === "idle") {
        await sleep(5000);
        if (!connection.state.networking.state.connectionData.speaking) {
            const resource = createAudioResource("rtsp://topaz.chat/live/" + StreamKey,
                {
                    inputType: StreamType.Arbitrary,
                });
            const player = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Pause,
                },
            });
            await interaction.editReply("Auto resuming...");
            console.log('Autoresume has started!');
            player.play(resource);
            connection.subscribe(player);
            await sleep(5000);
            if (connection.state.networking.state.connectionData.speaking) {
                await interaction.editReply("Autoresumed");
                console.log(StreamKey + " is Autoresumed!");
                await interaction.editReply("Playing " + StreamKey);
            }
        }
        continue;
    }
    connection = null;
    StreamKey = null;
};
/**
 *
 * @param {CommandInteraction} interaction
 */
async function stop(interaction) {
    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Pause,
        },
    });
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.member.id);
    const memberVC = member.voice.channel;
    const status = ["●Stopping Sounds...", `●Disconnecting from ${memberVC}...`];
    const p = interaction.reply(status.join("\n"));
    if (!connection) {
        connection = joinVoiceChannel({
            guildId: guild.id,
            channelId: memberVC.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: false,
        });
    };
    const promises = [];
    promises.push(entersState(connection, VoiceConnectionStatus.Ready, 1000 * 10).then(() => status[0] += "Done!"));
    promises.push(entersState(player, AudioPlayerStatus.AutoPaused, 1000 * 10).then(() => status[1] += "Done!"));
    await Promise.race(promises);
    await p;
    console.log(StreamKey + " is destroyed!");
    connection.destroy();
    await interaction.editReply("Destroyed");
    connection = null;
    StreamKey = null;
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
            interaction.editReply("An error has occurred.").catch(() => { });
        } else {
            interaction.reply("An error has occurred.").catch(() => { });
        }
        throw err;
    }
}
async function onResync(interaction) {
    try {
        await resync(interaction);
    } catch (err) {
        if (interaction.replied) {
            interaction.editReply("An error has occurred.").catch(() => { });
        } else {
            interaction.reply("An error has occurred.").catch(() => { });
        }
        throw err;
    }
}
async function onStop(interaction) {
    try {
        await stop(interaction);
    } catch (err) {
        if (interaction.replied) {
            interaction.editReply("An error has occurred.").catch(() => { });
        } else {
            interaction.reply("An error has occurred.").catch(() => { });
        }
        throw err;
    }
}
/**
 *
 *@param {Discord.CommandInteraction} interaction
 */
async function onCommandInteraction(interaction) {
    if (interaction.commandName === "play") {
        return onPlay(interaction);
    }
    if (interaction.commandName === "resync") {
        return onResync(interaction);
    }
    if (interaction.commandName === "stop") {
        return onStop(interaction);
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
process.on("unhandledRejection", error => console.error("Promise rejection:", error));
console.log('TopazBot client ready...');
client.login(process.env.DISCORD_TOKEN)