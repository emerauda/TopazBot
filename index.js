const { Client, GatewayIntentBits } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    AudioPlayerStatus,
    generateDependencyReport,
    VoiceConnectionStatus
} = require('@discordjs/voice');
const { token } = require('./config.json');

let voiceConnections = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

console.log(generateDependencyReport());

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}! ready...`);
});

async function connectToChannel(channelId, guild) {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.joinable || !channel.speakable) {
        throw new Error('Voice channel is inaccessible.');
    }
    return joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
    });
}

const streamKeys = new Map();

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() || !interaction.guildId) return;

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        await interaction.reply('You need to be in a voice channel to use this command!');
        return;
    }

    switch (interaction.commandName) {
        case 'play':
            await interaction.deferReply();
            const streamKey = interaction.options.getString('streamkey');
            if (!streamKey) {
                await interaction.editReply('No stream key provided!');
                return;
            }
            try {
                const connection = await connectToChannel(voiceChannel.id, interaction.guild);
                await playStream(interaction, connection, streamKey, voiceChannel.id);
                voiceConnections.set(interaction.guildId, connection);
                streamKeys.set(interaction.guildId, streamKey);
            } catch (error) {
                console.error('Error:', error);
                await interaction.followUp('Failed to play the stream.');
            }
            break;

        case 'resync':
            if (!voiceConnections.has(interaction.guildId) || !streamKeys.has(interaction.guildId)) {
                await interaction.reply("Not connected to any voice channel or no stream key saved.");
                return;
            }
            await interaction.deferReply();
            const resyncConnection = voiceConnections.get(interaction.guildId);
            const resyncStreamKey = streamKeys.get(interaction.guildId);
            const resyncChannel = resyncConnection.joinConfig.channelId;
            console.log(`${resyncStreamKey} is resyncing...`);
            await playStream(interaction, resyncConnection, resyncStreamKey, await interaction.guild.channels.fetch(resyncChannel));
            break;

        case 'stop':
            if (!voiceConnections.has(interaction.guildId)) {
                await interaction.reply("Not connected to any voice channel.");
                return;
            }
            await interaction.deferReply();
            const connectionToDestroy = voiceConnections.get(interaction.guildId);
            const stopStreamKey = streamKeys.get(interaction.guildId);
            connectionToDestroy.destroy();
            console.log(`${stopStreamKey} is destroyed!`);
            voiceConnections.delete(interaction.guildId);
            streamKeys.delete(interaction.guildId);
            await interaction.followUp(`${stopStreamKey} is destroyed.`);
            break;
    }
});

async function playStream(interaction, connection, streamKey, channelId) {
    const streamUrl = `rtsp://topaz.chat/live/${streamKey}`;
    const resource = createAudioResource(streamUrl);
    const player = createAudioPlayer();
    connection.subscribe(player);
    player.play(resource);

    let lastActiveTime = Date.now();
    const maxReconnectInterval = 30 * 60 * 1000;

    player.on(AudioPlayerStatus.Playing, () => {
        lastActiveTime = Date.now();
        console.log(`${streamKey} is playing!`);
        interaction.editReply(`${streamKey} is playing.`);
    });

    player.on(AudioPlayerStatus.Idle, async () => {
        if (Date.now() - lastActiveTime > maxReconnectInterval) {
            connection.destroy();
            voiceConnections.delete(interaction.guildId);
            streamKeys.delete(interaction.guildId);
            console.log(`${streamKey} is autodestroyed!`);
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(`${streamKey} is autodestroyed.`);
            } else {
                await interaction.reply(`${streamKey} is autodestroyed.`);
            }
            return;
        }

        setTimeout(async () => {
            if (!voiceConnections.has(interaction.guildId)) {
                return;
            }
           try {
                const newConnection = await connectToChannel(channelId, interaction.guild);
                await playStream(interaction, newConnection, streamKey, channelId);
                voiceConnections.set(interaction.guildId, newConnection);
                console.log(`${streamKey} is autoresuming...`);
            } catch (error) {
                connection.destroy();
                console.error('Error resuming:', error);
                console.log(`${streamKey} failed to autoresuming!`);
                await interaction.followUp(`${streamKey} failed to autoresume.`);
            }
        }, 5000);
    });
    await entersState(player, AudioPlayerStatus.Playing, 5000);
}
client.login(token);
