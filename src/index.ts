import { Client, GatewayIntentBits, CommandInteraction, GuildMember, VoiceBasedChannel, ChannelType, VoiceChannel } from 'discord.js';
import type { VoiceConnection, AudioPlayer as AudioPlayerType } from '@discordjs/voice';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, generateDependencyReport, VoiceConnectionStatus, StreamType } from '@discordjs/voice';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import type { ChildProcess } from 'child_process';
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

// Read stream number from environment variable (as string)
const number = process.env.NUMBER;
const stream = process.env.STREAM;
const STATIC_STREAM_KEY = `${stream}${number}`;

// Utility sleep function
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// FFmpeg stream creator — AAC→Opus transcode with low-latency flags, output as OggOpus
// OggOpus is passed directly to discord.js without re-transcoding via prism-media
function createFFmpegStream(streamUrl: string): { stream: Readable; process: ChildProcess } {
    const ffmpeg = spawn('ffmpeg', [
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-rtsp_transport', 'tcp',
        '-i', streamUrl,
        '-vn',
        '-c:a', 'libopus',
        '-ar', '48000',
        '-ac', '2',
        '-b:a', '192k',
        '-application', 'audio',
        '-f', 'ogg',
        'pipe:1',
    ]);
    ffmpeg.stderr?.on('data', (d: Buffer) => {
        const msg = d.toString().trim();
        // Only log errors/warnings, not progress
        if (msg.includes('Error') || msg.includes('error') || msg.includes('Warning') || msg.includes('Discarding')) {
            console.error(`[ffmpeg] ${msg}`);
        }
    });
    ffmpeg.on('exit', (code, signal) => {
        if (code !== 0 && code !== 255) {
            console.warn(`[ffmpeg] exited code=${code} signal=${signal}`);
        }
    });
    return { stream: ffmpeg.stdout as Readable, process: ffmpeg };
}

// Per-guild connection state
interface GuildAudioState {
    connection: InstanceType<typeof VoiceConnection> | null;
    player: InstanceType<typeof AudioPlayerType> | null;
    ffmpegProcess: ChildProcess | null;
    streamKey: string | null;
    streamUrl: string | null;
    lastActivityTime: number;
    isPlaying: boolean;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
console.log(generateDependencyReport());

// Manage state for each guild
const guildAudioStates: Map<string, GuildAudioState> = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}! client ready...`);
});

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
            ffmpegProcess: null,
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
        if (state.ffmpegProcess) {
            state.ffmpegProcess.kill();
        }
        if (state.connection) {
            const key = state.streamKey;
            state.connection.destroy();
            console.log(`[${key}] stopped by user`);
        }
        guildAudioStates.set(guildId, {
            connection: null,
            player: null,
            ffmpegProcess: null,
            streamKey: null,
            streamUrl: null,
            lastActivityTime: Date.now(),
            isPlaying: false,
        });
        await interaction.editReply('Destroyed.');
    }
});

// Stream playback, auto-reconnect, and auto-disconnect logic
async function playStream(
    state: GuildAudioState,
    interaction: CommandInteraction | null,
    isResync = false
) {
    if (!state.connection || !state.streamUrl || !state.streamKey) return;
    const key = state.streamKey;

    let first = true;
    let notified = false;
    while (true) {
        // Kill previous ffmpeg if still alive
        if (state.ffmpegProcess) {
            state.ffmpegProcess.kill();
            state.ffmpegProcess = null;
        }

        const { stream: ffmpegStream, process: ffmpegProc } = createFFmpegStream(state.streamUrl);
        state.ffmpegProcess = ffmpegProc;
        const resource = createAudioResource(ffmpegStream, { inputType: StreamType.OggOpus });
        const player = createAudioPlayer();
        player.play(resource);
        state.player = player;
        state.connection.subscribe(player);
        state.lastActivityTime = Date.now();

        let playSucceeded = false;

        try {
            await entersState(player, AudioPlayerStatus.Playing, 5000);

            // Confirm stable playback for 1.5s
            let stable = false;
            await Promise.race([
                (async () => { await sleep(1500); stable = true; })(),
                entersState(player, AudioPlayerStatus.Idle, 1500),
            ]);
            if (!stable) throw new Error('Stream stopped immediately');

            playSucceeded = true;

            if (first) {
                if (interaction && !notified) {
                    await interaction.editReply(`Playing ${key}.`);
                    notified = true;
                }
                if (isResync) {
                    console.log(`[${key}] resyncing`);
                    await sleep(5000);
                    console.log(`[${key}] resynced`);
                }
                first = false;
            } else {
                console.log(`[${key}] autoresumed`);
            }
            console.log(`[${key}] playing`);

            await entersState(player, AudioPlayerStatus.Idle, 86400000);
            console.log(`[${key}] stream ended`);
        } catch (e) {
            if (!playSucceeded) {
                if (first && interaction && !notified) {
                    await interaction.editReply(`${key} is autoresuming...`);
                    notified = true;
                }
                console.log(`[${key}] autoresuming (stream not stable)`);
                await sleep(10000);
                continue;
            }
            console.warn(`[${key}] playback error, retrying`, e instanceof Error ? e.message : e);
            await sleep(10000);
        }

        if (!state.connection) break;
        console.log(`[${key}] autoresuming`);
        await sleep(5000);
    }
}

// The target voice channel ID to monitor
const TARGET_VOICE_CHANNEL_ID = process.env.TARGET_VOICE_CHANNEL_ID || "";

// Listen for voice state updates
client.on('voiceStateUpdate', async (oldState, newState) => {
    // 1. When a user joins the target voice channel
    if (
        newState.channelId === TARGET_VOICE_CHANNEL_ID && // Joined the target channel
        oldState.channelId !== TARGET_VOICE_CHANNEL_ID && // Was not in the target channel before
        !newState.member?.user.bot // Ignore bot's own join/leave
    ) {
        const channel = newState.channel;
        if (!channel || channel.type !== ChannelType.GuildVoice) return;

        // If the bot is already in the channel, do nothing
        if (channel.members.some(m => m.user.bot)) return;

        // Bot joins the channel and starts playback
        const guildId = channel.guild.id;
        let state = guildAudioStates.get(guildId);
        if (!state) {
            state = {
                connection: null,
                player: null,
                ffmpegProcess: null,
                streamKey: null,
                streamUrl: null,
                lastActivityTime: Date.now(),
                isPlaying: false,
            };
            guildAudioStates.set(guildId, state);
        }
        if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
            state.connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: guildId,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });
        }
        state.streamKey = STATIC_STREAM_KEY;
        state.streamUrl = `rtsp://topaz.chat/live/${STATIC_STREAM_KEY}`;
        if (!state.isPlaying) {
            state.isPlaying = true;
            // Since there is no interaction, pass null and handle it in playStream
            playStream(state, null as any).finally(() => {
                state.isPlaying = false;
            });
        }
    }

    // 2. When a user leaves the target voice channel
    if (
        oldState.channelId === TARGET_VOICE_CHANNEL_ID && // Left the target channel
        newState.channelId !== TARGET_VOICE_CHANNEL_ID // Is not in the target channel anymore
    ) {
        const channel = oldState.channel;
        if (!channel || channel.type !== ChannelType.GuildVoice) return;

        // If there are no non-bot members left, bot leaves the channel
        const nonBotMembers = channel.members.filter(m => !m.user.bot);
        if (nonBotMembers.size === 0) {
            const guildId = channel.guild.id;
            const state = guildAudioStates.get(guildId);
            if (state && state.connection) {
                if (state.ffmpegProcess) state.ffmpegProcess.kill();
                state.connection.destroy();
                console.log(`[${state.streamKey}] auto-disconnected (empty channel)`);
                guildAudioStates.set(guildId, {
                    connection: null,
                    player: null,
                    ffmpegProcess: null,
                    streamKey: null,
                    streamUrl: null,
                    lastActivityTime: Date.now(),
                    isPlaying: false,
                });
            }
        }
    }
});

client.login(token);