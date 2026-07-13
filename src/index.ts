import {
    Client,
    GatewayIntentBits,
    CommandInteraction,
    GuildMember,
    ChannelType,
    VoiceChannel,
} from 'discord.js';
import type { VoiceConnection, AudioPlayer as AudioPlayerType } from '@discordjs/voice';
import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    AudioPlayerStatus,
    generateDependencyReport,
    VoiceConnectionStatus,
    StreamType,
} from '@discordjs/voice';
import { spawn } from 'child_process';
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

// Read the fixed stream identity from environment variables.
// NUMBER defaults to an empty string (commands become play/resync/stop);
// STREAM is required — without the check the key would contain "undefined".
const number = process.env.NUMBER ?? '';
const stream = process.env.STREAM;
if (!stream) {
    throw new Error('STREAM is not set in environment variables.');
}
const STATIC_STREAM_KEY = `${stream}${number}`;
const STREAM_URL = `rtsp://topaz.chat/live/${STATIC_STREAM_KEY}`;

// Utility sleep function
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// FFmpeg stream creator — AAC→Opus transcode with low-latency flags, output as OggOpus
// OggOpus is passed directly to discord.js without re-transcoding via prism-media
function createFFmpegStream(streamUrl: string): { stream: Readable; process: ChildProcess } {
    const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',
        '-nostats',
        '-loglevel', 'warning',
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
    // stderr is consumed continuously so the pipe buffer can never fill up
    // and block ffmpeg; only errors/warnings are logged.
    ffmpeg.stderr?.on('data', (d: Buffer) => {
        const msg = d.toString().trim();
        if (msg.includes('Error') || msg.includes('error') || msg.includes('Warning') || msg.includes('Discarding')) {
            console.error(`[ffmpeg] ${msg}`);
        }
    });
    ffmpeg.on('exit', (code, signal) => {
        if (code !== 0 && code !== 255 && code !== null) {
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
    // Generation number of the playback session. Bumped whenever a new session
    // takes over (play/resync) or the session is stopped (stop/auto-leave);
    // stale playStream loops detect the change and exit safely.
    epoch?: number;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
console.log(generateDependencyReport());

// Manage state for each guild
const guildAudioStates: Map<string, GuildAudioState> = new Map();

function getOrCreateGuildState(guildId: string): GuildAudioState {
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
            epoch: 0,
        };
        guildAudioStates.set(guildId, state);
    }
    return state;
}

function killFfmpeg(state: GuildAudioState): void {
    if (state.ffmpegProcess) {
        try {
            state.ffmpegProcess.kill();
        } catch {
            // already dead
        }
        state.ffmpegProcess = null;
    }
}

function stopPlayer(state: GuildAudioState): void {
    if (state.player) {
        try {
            state.player.stop(true);
        } catch {
            // ignore
        }
    }
}

// Invalidate the running playStream loop and release all resources.
// The state is reset in place so stale references also observe the reset.
function stopGuildSession(state: GuildAudioState): void {
    state.epoch = (state.epoch ?? 0) + 1;
    killFfmpeg(state);
    stopPlayer(state);
    if (state.connection) {
        try {
            state.connection.destroy();
        } catch {
            // already destroyed
        }
    }
    state.connection = null;
    state.player = null;
    state.streamKey = null;
    state.streamUrl = null;
    state.lastActivityTime = Date.now();
    state.isPlaying = false;
}

// editReply can reject (expired token, API errors); never let that break playback.
async function safeEditReply(interaction: CommandInteraction | null, content: string): Promise<void> {
    if (!interaction) return;
    try {
        await interaction.editReply(content);
    } catch (err) {
        console.warn('editReply failed:', err);
    }
}

// Join a voice channel and attach the standard recovery handler.
// A Disconnected connection may be a channel move (Discord re-signals within
// a moment) or a real kick/channel deletion — only the latter is destroyed,
// which in turn makes the playStream loop exit and clean up.
function createVoiceConnection(channel: VoiceChannel, guildId: string) {
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5000),
            ]);
            // Reconnecting (e.g. moved to another channel) — leave it alone
        } catch {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
        }
    });
    return connection;
}

// Wait until the stream ends (player goes Idle). A single overall timeout would
// cut off healthy long-running streams, so wake up every 60s just to re-check.
async function waitForPlaybackEnd(
    player: InstanceType<typeof AudioPlayerType>,
    isStale: () => boolean
): Promise<void> {
    for (;;) {
        try {
            await entersState(player, AudioPlayerStatus.Idle, 60000);
            return;
        } catch {
            if (isStale()) return; // session was superseded
            if (player.state.status === AudioPlayerStatus.Playing) continue; // still playing fine
            return; // stuck in a state that is neither playing nor ended — let the caller retry
        }
    }
}

// Fire-and-forget launcher for playStream. Always go through here: an uncaught
// rejection would otherwise crash the whole process.
function startPlayStream(
    state: GuildAudioState,
    interaction: CommandInteraction | null,
    isResync = false
): void {
    playStream(state, interaction, isResync).catch(err => {
        console.error('playStream failed:', err);
    });
}

// Unified command handler
client.on('interactionCreate', async (interaction) => {
    try {
        if (!interaction.isChatInputCommand() || !interaction.guildId) return;
        const guildId = interaction.guildId;
        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;
        const state = getOrCreateGuildState(guildId);

        // play command
        if (interaction.commandName === `play${number}`) {
            try {
                await interaction.deferReply();
            } catch {
                return;
            }
            if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
                await interaction.editReply('Please join a voice channel.');
                return;
            }
            const vc = voiceChannel as VoiceChannel;
            if (!vc.joinable || !vc.speakable) {
                await interaction.editReply('Cannot join or speak in the voice channel.');
                return;
            }
            if (state.isPlaying) {
                await interaction.editReply('Already playing.');
                return;
            }
            if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
                state.connection = createVoiceConnection(vc, guildId);
            }
            state.streamKey = STATIC_STREAM_KEY;
            state.streamUrl = STREAM_URL;
            startPlayStream(state, interaction);
        }
        // resync command (force reload stream)
        else if (interaction.commandName === `resync${number}`) {
            try {
                await interaction.deferReply();
            } catch {
                return;
            }
            if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
                await interaction.editReply('Please join a voice channel.');
                return;
            }
            const vc = voiceChannel as VoiceChannel;

            // Fully stop the current session before recreating the connection
            killFfmpeg(state);
            stopPlayer(state);
            if (state.connection) {
                try {
                    state.connection.destroy();
                } catch {
                    // already destroyed
                }
            }
            state.connection = createVoiceConnection(vc, guildId);
            state.streamKey = STATIC_STREAM_KEY;
            state.streamUrl = STREAM_URL;
            startPlayStream(state, interaction, true);
        }
        // stop command
        else if (interaction.commandName === `stop${number}`) {
            try {
                await interaction.deferReply();
            } catch {
                return;
            }
            const key = state.streamKey;
            const hadConnection = !!state.connection;
            stopGuildSession(state);
            if (hadConnection) console.log(`[${key}] stopped by user`);
            await interaction.editReply(hadConnection ? 'Destroyed.' : 'Not in a voice channel.');
        }
    } catch (e) {
        console.error('interaction error', e);
    }
});

// Stream playback, auto-reconnect, and auto-disconnect logic
async function playStream(
    state: GuildAudioState,
    interaction: CommandInteraction | null,
    isResync = false
) {
    // Take ownership of this state. If epoch changes later, a newer session has
    // replaced this one and this loop must exit without touching anything.
    const epoch = (state.epoch ?? 0) + 1;
    state.epoch = epoch;
    const isStale = () => state.epoch !== epoch;

    if (!state.connection || !state.streamUrl || !state.streamKey) return;
    const key = state.streamKey;

    state.isPlaying = true;
    try {
        let first = true;
        let notified = false;
        while (true) {
            if (isStale() || !state.connection) break;

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
                state.lastActivityTime = Date.now();

                if (first) {
                    if (!notified) {
                        await safeEditReply(interaction, `Playing ${key}.`);
                        notified = true;
                    }
                    if (isResync) {
                        console.log(`[${key}] resynced`);
                    }
                    first = false;
                } else {
                    console.log(`[${key}] autoresumed`);
                }
                console.log(`[${key}] playing`);

                // Wait for the stream to end (no overall cap — a healthy stream
                // may play for days)
                await waitForPlaybackEnd(player, isStale);
                state.lastActivityTime = Date.now();
                if (!isStale()) console.log(`[${key}] stream ended`);
            } catch (e) {
                if (isStale()) break;
                if (!playSucceeded) {
                    if (first && !notified) {
                        await safeEditReply(interaction, `${key} is autoresuming...`);
                        notified = true;
                    }
                    console.log(`[${key}] autoresuming (stream not stable)`);
                    await sleep(10000);
                    continue;
                }
                console.warn(`[${key}] playback error, retrying`, e instanceof Error ? e.message : e);
                await sleep(10000);
            } finally {
                // Make sure the ffmpeg spawned by this iteration is gone
                // (prevents piling up processes across retries)
                try {
                    ffmpegProc.kill();
                } catch {
                    // already dead
                }
                if (state.ffmpegProcess === ffmpegProc) state.ffmpegProcess = null;
            }

            if (
                isStale() ||
                !state.connection ||
                state.connection.state.status === VoiceConnectionStatus.Destroyed
            ) {
                break;
            }
            console.log(`[${key}] autoresuming`);
            await sleep(5000);
        }
    } finally {
        // Only clear the flag if this session is still the latest one
        if (!isStale()) state.isPlaying = false;
    }
}

// The target voice channel ID to monitor
const TARGET_VOICE_CHANNEL_ID = process.env.TARGET_VOICE_CHANNEL_ID || "";

// Listen for voice state updates
client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        if (!TARGET_VOICE_CHANNEL_ID) return;

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
            const state = getOrCreateGuildState(guildId);
            if (state.isPlaying) return;
            if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
                state.connection = createVoiceConnection(channel, guildId);
            }
            state.streamKey = STATIC_STREAM_KEY;
            state.streamUrl = STREAM_URL;
            startPlayStream(state, null);
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
                    const key = state.streamKey;
                    stopGuildSession(state);
                    console.log(`[${key}] auto-disconnected (empty channel)`);
                }
            }
        }
    } catch (e) {
        console.error('voiceStateUpdate error', e);
    }
});

// 'clientReady' replaces the deprecated 'ready' event (discord.js v14.22+ / v15)
client.once('clientReady', () => {
    console.log(`Logged in as ${client.user?.tag}! client ready...`);
});

client.login(token);
