import { Client, GatewayIntentBits, CommandInteraction, GuildMember, VoiceBasedChannel, ChannelType, VoiceChannel } from 'discord.js';
import type { VoiceConnection, AudioPlayer as AudioPlayerType } from '@discordjs/voice';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, generateDependencyReport, VoiceConnectionStatus } from '@discordjs/voice';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { readFileSync } from 'fs';
import { Readable } from 'stream';

// Simple .env loader (no external dependencies)
try {
  const env = readFileSync('.env', 'utf-8');
  env.split('\n').forEach(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) {
      const [, key, value] = match;
      if (!process.env[key]) {
        process.env[key] = value.replace(/^['\"]|['\"]$/g, ''); // remove quotes
      }
    }
  });
} catch (e) {
  // Do nothing if .env does not exist
}

// Read token from environment variable
const token = process.env.DISCORD_TOKEN;
if (!token) {
    throw new Error('DISCORD_TOKEN is not set in environment variables.');
}

// Utility sleep function
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// FFmpeg stream creator
function createFFmpegStream(streamUrl: string): Readable {
    const ffmpeg = spawn('ffmpeg', [
        '-rtsp_transport', 'tcp',
        '-i', streamUrl,
        '-f', 'adts',
        '-c:a', 'copy',
        'pipe:1'
    ]);
    return ffmpeg.stdout as Readable;
}

// Per-guild connection state
interface GuildAudioState {
    connection: InstanceType<typeof VoiceConnection> | null;
    player: InstanceType<typeof AudioPlayerType> | null;
    streamKey: string | null;
    streamUrl: string | null;
    lastActivityTime: number;
    isPlaying: boolean; // Prevent multiple playStream per guild
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
console.log(generateDependencyReport());

// Manage state for each guild
const guildAudioStates: Map<string, GuildAudioState> = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}! client ready...`);
});

const stream = "maitake";
const number = "0";
const STATIC_STREAM_KEY = `${stream}${number}`;

// Unified command handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() || !interaction.guildId) return;
    const guildId = interaction.guildId;
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    let state = guildAudioStates.get(guildId);
    if (!state) {
        state = {
            connection: null,
            player: null,
            streamKey: null,
            streamUrl: null,
            lastActivityTime: Date.now(),
            isPlaying: false,
        };
        guildAudioStates.set(guildId, state);
    }

    // play command
    if (interaction.commandName === `play${number}`) {
        await interaction.deferReply();
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
            await interaction.editReply('Please join a voice channel.');
            return;
        }
        const vc = voiceChannel as VoiceChannel;
        if (!vc.joinable || !vc.speakable) {
            await interaction.editReply('Cannot join or speak in the voice channel.');
            return;
        }
        if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
            state.connection = joinVoiceChannel({
                channelId: vc.id,
                guildId: guildId,
                adapterCreator: vc.guild.voiceAdapterCreator,
            });
        }
        state.streamKey = STATIC_STREAM_KEY;
        state.streamUrl = `rtsp://topaz.chat/live/${STATIC_STREAM_KEY}`;
        // Prevent multiple playStream per guild
        if (!state.isPlaying) {
            state.isPlaying = true;
            playStream(state, interaction).finally(() => {
                state.isPlaying = false;
            });
        } else {
            await interaction.editReply('Already playing.');
        }
    }
    // resync command (force reload stream)
    else if (interaction.commandName === `resync${number}`) {
        await interaction.deferReply();
        const voiceChannel = (interaction.member as GuildMember).voice.channel;
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
            await interaction.editReply('Please join a voice channel.');
            return;
        }
        const vc = voiceChannel as VoiceChannel;

        // Force stop current playback if exists
        if (state.connection) {
            state.connection.destroy();
        }
        // Create new connection
        state.connection = joinVoiceChannel({
            channelId: vc.id,
            guildId: guildId,
            adapterCreator: vc.guild.voiceAdapterCreator,
        });

        state.streamKey = STATIC_STREAM_KEY;
        state.streamUrl = `rtsp://topaz.chat/live/${STATIC_STREAM_KEY}`;

        // Force start playback
        state.isPlaying = true;
        playStream(state, interaction, true).finally(() => {
            state.isPlaying = false;
        });
    }
    // stop command
    else if (interaction.commandName === `stop${number}`) {
        await interaction.deferReply();
        if (state.connection) {
            state.connection.destroy();
        }
        // Reset all state for this guild
        guildAudioStates.set(guildId, {
            connection: null,
            player: null,
            streamKey: null,
            streamUrl: null,
            lastActivityTime: Date.now(),
            isPlaying: false,
        });
        await interaction.editReply('Destroyed.');
    }
});

// Stream playback, auto-reconnect, and auto-disconnect logic
async function playStream(state: GuildAudioState, interaction: CommandInteraction, isResync = false) {
    if (!state.connection || !state.streamUrl || !state.streamKey) return;

    let first = true;
    while (true) {
        const ffmpegStream = createFFmpegStream(state.streamUrl);
        const resource = createAudioResource(ffmpegStream);
        const player = createAudioPlayer();
        player.play(resource);
        state.player = player;
        state.connection.subscribe(player);
        state.lastActivityTime = Date.now();

        if (first) {
            if (isResync) {
                console.log(`${state.streamKey} is resyncing...`);
            } else {
                console.log(`${state.streamKey} is playing!`);
            }
        }

        let resumed = false;
        try {
            // Wait for Playing state (start)
            await entersState(player, AudioPlayerStatus.Playing, 5000);

            // Wait 1 second and check if still playing to confirm real playback
            await sleep(1000);
            if (player.state.status !== 'playing') {
                throw new Error('Stream did not stay in playing state');
            }

            if (first) {
                await interaction.editReply(`Playing ${state.streamKey}.`);
                // Wait 1 second and check if still playing to confirm real playback
                await sleep(1000);
                if (player.state.status !== 'playing') {
                    throw new Error('Stream did not stay in playing state');
                }
                if (isResync) {
                    console.log(`${state.streamKey} is resynced!`);
                }
                first = false;
            } else {
                console.log(`${state.streamKey} is autoresumed!`);
            }
            // Wait for Idle state (end)
            await entersState(player, AudioPlayerStatus.Idle, 1800000);
            console.log(`${state.streamKey} is stopped!`);
        } catch (e) {
            if (first) {
                await interaction.editReply('Failed to play stream.');
                return;
            }
            await sleep(3000);
            // continue loop for retry
        }

        // Auto-disconnect if too long idle
        if (!state.connection) break;
        if (Date.now() - state.lastActivityTime > 1800000) { // 30 minutes
            console.log(`${state.streamKey} is autodestroyed!`);
            state.connection.destroy();
            state.connection = null;
            state.player = null;
            break;
        }

        // If connection still exists, try to autoresume (continue loop)
        if (state.connection) {
            console.log(`${state.streamKey} is autoresuming...`);
            await sleep(3000); // Optional: wait before reconnect
            continue;
        } else {
            break;
        }
    }
}

client.login(token);