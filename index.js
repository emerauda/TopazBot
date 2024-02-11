const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, generateDependencyReport } = require('@discordjs/voice');
const { token } = require('./config.json');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
console.log(generateDependencyReport());
function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
let streamKey = null;
let streamUrl = null;

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}! client ready...`);
  });

// Handles slash command interactions
// play command
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() || !interaction.guildId) return;
    if (interaction.commandName === "play") {
        await interaction.deferReply();
        const voiceChannel = interaction.member.voice.channel;
        if (!interaction.member.voice.channelId) {
          await interaction.reply('You need to be in a voice channel to use this command!');
          return;
        }
        if (!connection) {
            connection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: interaction.guildId,
              adapterCreator: interaction.guild.voiceAdapterCreator,
            });
        };
        // Extract the stream URL from the command
        streamKey = interaction.options.get('streamkey').value;
        streamUrl = `rtsp://topaz.chat/live/${streamKey}`;
        const resource = createAudioResource(streamUrl);
        const player = createAudioPlayer();
        player.play(resource);
        console.log(`${streamKey} is playing!`);
        connection.subscribe(player);
        await entersState(player, AudioPlayerStatus.Playing, 5000);
        await interaction.editReply(`Playing ${streamKey}`);
        await entersState(player, AudioPlayerStatus.Idle);
        console.log(`${streamKey} is stopped!`);
        // Automatic disconnection if no stream is detected for 30 minutes
        let lastActivityTime = new Date();
        while (player.state.status === "idle") {
            const currentTime = new Date();
            await sleep(5000);
            if (connection.state.status === "destroyed") {
                break;
            }
            if (connection.state.subscription.player._state.status === "idle") {

              const resource = createAudioResource(streamUrl);
              const player = createAudioPlayer();
                await sleep(3000);
                console.log(`${streamKey} is autoresuming...`);
                player.play(resource);
                connection.subscribe(player)
                await sleep(5000);
                if (connection.state.status === "destroyed") {
                    break;
                }
                if (connection.state.subscription.player._state.status === "playing") {
                    console.log(`${streamKey} is autoresumed!`);
                    let lastActivityTime = new Date();
                }
                if (currentTime - lastActivityTime > 1800000) {
                    console.log(`${streamKey} is autodestroyed!`);
                    connection.destroy();
                    break;
                }
            }
            continue;
        }
    }
    return {
        streamKey: streamKey,
        streamUrl: streamUrl,
    };
})

// resync command
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() || !interaction.guildId) return;
    let connection = null;
    if (interaction.commandName === "resync") {
        await interaction.deferReply();
        const voiceChannel = interaction.member.voice.channel;
        if (!interaction.member.voice.channelId) {
          await interaction.reply('You need to be in a voice channel to use this command!');
          return;
        }
        if (!connection) {
            connection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: interaction.guildId,
              adapterCreator: interaction.guild.voiceAdapterCreator,
            });
        };
        const streamUrl = `rtsp://topaz.chat/live/${streamKey}`;
        const resource = createAudioResource(streamUrl);
        const player = createAudioPlayer();
        console.log(`${streamKey} is resyncing...`);
        player.play(resource);
        console.log(`${streamKey} is playing!`);
        connection.subscribe(player);
        await entersState(player, AudioPlayerStatus.Playing, 5000);
        await interaction.editReply(`Playing ${streamKey}`);
        await entersState(player, AudioPlayerStatus.Idle);
        console.log(`${streamKey} is stopped!`);
        // Automatic disconnection if no stream is detected for 30 minutes
        let lastActivityTime = new Date();
        while (player.state.status === "idle") {
            const currentTime = new Date();
            await sleep(5000);
            if (connection.state.status === "destroyed") {
                break;
            }
            if (connection.state.subscription.player._state.status === "idle") {

                const resource = createAudioResource(streamUrl);
                const player = createAudioPlayer();
                await sleep(3000);
                console.log(`${streamKey} is autoresuming...`);
                player.play(resource);
                connection.subscribe(player)
                await sleep(5000);
                if (connection.state.status === "destroyed") {
                    break;
                }
                if (connection.state.subscription.player._state.status === "playing") {
                    console.log(`${streamKey} is autoresumed!`);
                    let lastActivityTime = new Date();
                }
                if (currentTime - lastActivityTime > 1800000) {
                    console.log(`${streamKey} is autodestroyed!`);
                    connection.destroy();
                    break;
                }
            }
            continue;
        }
    }
    connection = null;
});

// stop command
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() || !interaction.guildId) return;
    if (interaction.commandName === "stop") {
        await interaction.deferReply();
        const voiceChannel = interaction.member.voice.channel;
        if (!interaction.member.voice.channelId) {
          await interaction.reply('You need to be in a voice channel to use this command!');
          return;
        }
        const player = createAudioPlayer();
        if (!connection) {
            connection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: interaction.guildId,
              adapterCreator: interaction.guild.voiceAdapterCreator,
            });
        };
        console.log(`${streamKey} is destroyed!`);
        connection.destroy();
        await interaction.editReply("Destroyed");
    };
    connection = null;
});

client.login(token)
