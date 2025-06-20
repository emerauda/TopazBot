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

// Read stream number from environment variable (as string)
const number = process.env.NUMBER || "0";
const stream = "maitake";
const STATIC_STREAM_KEY = `${stream}${number}`;

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
        // Force disconnect: destroy connection and stop playback
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
async function playStream(
    state: GuildAudioState,
    interaction: CommandInteraction | null,
    isResync = false
) {
    if (!state.connection || !state.streamUrl || !state.streamKey) return;

    let first = true;
    let notified = false;
    while (true) {
        const ffmpegStream = createFFmpegStream(state.streamUrl);
        const resource = createAudioResource(ffmpegStream);
        const player = createAudioPlayer();
        player.play(resource);
        state.player = player;
        state.connection.subscribe(player);
        state.lastActivityTime = Date.now();

        let playStart: number | null = null;
        let playSucceeded = false;

        try {
            // Wait for Playing state (start)
            await entersState(player, AudioPlayerStatus.Playing, 5000);
            playStart = Date.now();

            // Wait for either Idle or 2 seconds, whichever comes first
            let playedLongEnough = false;
            await Promise.race([
                (async () => {
                    await sleep(1500); // Wait at least 1.5 seconds
                    playedLongEnough = true;
                })(),
                (async () => {
                    await entersState(player, AudioPlayerStatus.Idle, 1500);
                })()
            ]);

            if (!playedLongEnough) {
                // The player became Idle before 1.5 seconds passed
                throw new Error('Stream did not stay in playing state for at least 1 second');
            }

            // If we reach here, playback was stable for at least 1.5 seconds
            playSucceeded = true;

            if (first) {
                if (interaction && !notified) {
                    await interaction.editReply(`Playing ${state.streamKey}.`);
                    notified = true;
                }
                if (isResync) {
                    console.log(`${state.streamKey} is resynced!`);
                }
                first = false;
            }
            console.log(`${state.streamKey} is playing!`);
            // Wait for Idle state (end)
            await entersState(player, AudioPlayerStatus.Idle, 1800000);
            console.log(`${state.streamKey} is stopped!`);
        } catch (e) {
            if (!playSucceeded) {
                if (first) {
                    if (interaction && !notified) {
                        await interaction.editReply(`${state.streamKey} is autoresuming...`);
                        notified = true;
                    } else {
                        console.log(`${state.streamKey} is autoresuming...`);
                    }
                } else {
                    console.log(`${state.streamKey} is autoresuming...`);
                }
                await sleep(10000);
                continue;
            }
            await sleep(10000);
        }

        // If connection still exists, try to autoresume (continue loop)
        if (state.connection) {
            console.log(`${state.streamKey} is autoresuming...`);
            await sleep(5000);
            continue;
        } else {
            break;
        }
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
                state.connection.destroy();
                guildAudioStates.set(guildId, {
                    connection: null,
                    player: null,
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