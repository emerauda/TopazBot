const { Client, GatewayIntentBits } = require('discord.js'); // Import necessary classes from discord.js
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, generateDependencyReport } = require('@discordjs/voice'); // Import voice-related functions
const { spawn } = require('child_process'); // Import spawn to run child processes
const { token } = require('./config.json'); // Import the bot token from a config file
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }); // Create a new Discord client with specific intents
console.log(generateDependencyReport()); // Log the dependency report for debugging

// Function to pause execution for a specified number of milliseconds
function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

let streamKey = null; // Variable to store the current stream key
let streamUrl = null; // Variable to store the current stream URL
let connection = null; // Variable to store the voice connection

// Function to create an FFmpeg stream from a given URL
function createFFmpegStream(streamUrl) {
    const ffmpeg = spawn('ffmpeg', [
        '-rtsp_transport', 'tcp', // Use TCP for RTSP transport
        '-i', streamUrl, // Input stream URL
        '-f', 'adts', // Output format
        '-c:a', 'copy', // Copy audio codec
        'pipe:1' // Output to stdout
    ]);
    return ffmpeg.stdout; // Return the stdout stream
}

// Function to join a voice channel
function joinVoice(interaction) {
    const voiceChannel = interaction.member.voice.channel; // Get the user's voice channel
    if (!voiceChannel) {
        interaction.editReply('You need to be in a voice channel to use this command!'); // Notify if not in a voice channel
        return false;
    }
    if (!voiceChannel.joinable || !voiceChannel.speakable) {
        interaction.editReply('Voice channel is inaccessible.'); // Notify if the channel cannot be joined or spoken in
        return false;
    }
    if (!connection) {
        connection = joinVoiceChannel({
            channelId: voiceChannel.id, // Channel ID to join
            guildId: interaction.guildId, // Guild ID
            adapterCreator: interaction.guild.voiceAdapterCreator, // Adapter creator for the guild
        });
        console.log("Connection established."); // Log connection establishment
    }
    return true;
}

let isAutoResuming = false; // Flag to track if autoresume is in progress
let connectionLost = false; // Flag to track if the connection was lost

// Function to play a stream in a voice channel
async function playStream(interaction) {
    if (!connection) {
        console.log("Attempting to join voice channel.");
        if (!joinVoice(interaction)) return; // Attempt to join the voice channel if not connected
    }

    const ffmpegStream = createFFmpegStream(streamUrl); // Create an FFmpeg stream
    const resource = createAudioResource(ffmpegStream); // Create an audio resource from the stream
    const player = createAudioPlayer(); // Create an audio player

    player.on('error', error => {
        console.error(`Error: ${error.message} with resource ${error.resource.metadata.title}`); // Log any errors
    });

    player.play(resource); // Play the audio resource
    connection.subscribe(player); // Subscribe the connection to the player
    await entersState(player, AudioPlayerStatus.Playing, 5000); // Wait until the player is playing
    await interaction.editReply(`Playing ${streamKey}`); // Notify that the stream is playing
    
    // Define the Idle event handler
    const handleIdle = async () => {
        if (isAutoResuming) {
            return; // Do nothing if autoresume is already in progress
        }

        if (!connectionLost) {
            console.log(`${streamKey} is stopped!`);
            connectionLost = true; // Mark connection as lost
        }

        console.log(`${streamKey} autoresume is starting...`);
        const message = await interaction.followUp(`Autoresuming...`); // Notify that autoresume is starting
        isAutoResuming = true;
        await autoResume(player, interaction, message); // Attempt to autoresume
        isAutoResuming = false;
        connectionLost = false; // Reset connection lost flag after successful resume

        // Re-subscribe to the Idle event
        player.off(AudioPlayerStatus.Idle, handleIdle); // Remove the existing listener
        player.on(AudioPlayerStatus.Idle, handleIdle);  // Add the listener again
    };

    // Subscribe to the Idle event
    player.on(AudioPlayerStatus.Idle, handleIdle);
}

// Function to handle autoresuming the stream
async function autoResume(player, interaction, message) {
    let lastActivityTime = new Date(); // Track the last activity time
    while (true) {
        const currentTime = new Date();
        await sleep(5000); // Wait for 5 seconds

        if (!connection || connection.state.status === "destroyed") {
            console.log("Connection is destroyed or null, attempting to rejoin...");
            if (!joinVoice(interaction)) {
                console.log("Failed to rejoin voice channel.");
                break; // Exit if unable to rejoin
            }
        }

        if (connection.state.subscription && connection.state.subscription.player.state.status === "idle") {
            console.log(`${streamKey} is autoresuming...`);
            await message.edit(`Autoresuming...`); // Update the message to indicate autoresuming
            
            const ffmpegStream = createFFmpegStream(streamUrl); // Recreate the FFmpeg stream
            const resource = createAudioResource(ffmpegStream); // Recreate the audio resource

            await sleep(1000); // Wait for 1 second
            
            player.play(resource); // Play the new resource
            connection.subscribe(player); // Subscribe the connection to the player
            await entersState(player, AudioPlayerStatus.Playing, 5000); // Wait until the player is playing
            
            await sleep(1000); // Wait for 1 second
            
            if (!connection || connection.state.status === "destroyed") {
                console.log("Connection is destroyed or null after playing, breaking loop.");
                break; // Exit if the connection is destroyed
            }
            if (connection.state.subscription && connection.state.subscription.player.state.status === "playing") {
                console.log(`${streamKey} is autoresumed!`);
                await message.edit(`Playing ${streamKey}`); // Update the message to indicate playing
                lastActivityTime = new Date(); // Update the last activity time
                return; // Exit the loop after successful resume
            }
            if (currentTime - lastActivityTime > 1800000) { // Check if 30 minutes have passed
                console.log(`${streamKey} is autodestroyed!`);
                await message.edit(`Autodestroyed`); // Update the message to indicate autodestroy
                connection.destroy(); // Destroy the connection
                connection = null; // Reset the connection
                break; // Exit the loop
            }
        }
    }
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}! client ready...`); // Log when the client is ready
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() || !interaction.guildId) return; // Ignore non-command interactions or those outside a guild
    await interaction.deferReply(); // Defer the reply to the interaction

    if (interaction.commandName === `play`) {
        if (!joinVoice(interaction)) return; // Attempt to join the voice channel
        streamKey = interaction.options.get('streamkey').value; // Get the stream key from the command options
        streamUrl = `rtsp://topaz.chat/live/${streamKey}`; // Construct the stream URL
        console.log(`${streamKey} is playing!`); // Log the stream key
        await playStream(interaction); // Play the stream
    } else if (interaction.commandName === `resync`) {
        if (!joinVoice(interaction)) return; // Attempt to join the voice channel
        console.log(`${streamKey} is resyncing...`); // Log resyncing
        await playStream(interaction); // Resync the stream
    } else if (interaction.commandName === `stop`) {
        if (!joinVoice(interaction)) return; // Attempt to join the voice channel
        console.log(`${streamKey} is destroyed!`); // Log destruction
        connection.destroy(); // Destroy the connection
        await interaction.editReply("Destroyed"); // Notify that the stream is destroyed
    }
    connection = null; // Reset the connection
});

client.login(token); // Log in to Discord with the bot token