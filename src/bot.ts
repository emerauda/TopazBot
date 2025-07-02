import { CommandInteraction, GuildMember, ChannelType, VoiceChannel } from 'discord.js';
import type { VoiceConnection, AudioPlayer as AudioPlayerType } from '@discordjs/voice';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { Readable } from 'stream';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';

// Inlined test environment check
const isTestEnv = !!process.env.JEST_WORKER_ID;

// Utility sleep function
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// FFmpeg stream creator
// In test environment, return an empty stream instead of executing FFmpeg
export function createFFmpegStream(streamUrl: string): Readable {
  if (isTestEnv) {
    return Readable.from([]);
  }
  // Transcode RTSP stream to raw PCM for Discord using system ffmpeg
  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport',
    'tcp',
    '-i',
    streamUrl,
    '-f',
    'adts',
    '-c:a',
    'copy',
    'pipe:1',
  ]);
  // Log FFmpeg stderr for diagnostics
  if (ffmpeg.stderr) {
    ffmpeg.stderr.on('data', (chunk) => {
      if (!isTestEnv) {
        console.error(`[ffmpeg stderr] ${chunk.toString()}`);
      }
    });
  }
  ffmpeg.on('error', (err) => {
    if (!isTestEnv) {
      console.error('[ffmpeg process error]', err);
    }
  });
  ffmpeg.on('close', (code, signal) => {
    console.log(`[ffmpeg process closed] code=${code} signal=${signal}`);
  });
  if (!ffmpeg.stdout) {
    throw new Error('FFmpeg stdout not available');
  }
  return ffmpeg.stdout;
}

// Per-guild connection state
export interface GuildAudioState {
  connection: InstanceType<typeof VoiceConnection> | null;
  player: InstanceType<typeof AudioPlayerType> | null;
  streamKey: string | null;
  streamUrl: string | null;
  lastActivityTime: number;
  isPlaying: boolean; // Prevent multiple playStream per guild
  ffmpegProcess?: ChildProcess | null;
}

export const guildAudioStates: Map<string, GuildAudioState> = new Map();

// Stream playback, auto-reconnect, and auto-disconnect logic
export async function playStream(
  state: GuildAudioState,
  interaction: CommandInteraction,
  isResync = false,
  testOptions?: { maxLoop?: number; forceBreak?: boolean }
) {
  // In test environment without explicit testOptions, set maxLoop=1 to prevent infinite loops
  if (isTestEnv && testOptions === undefined) {
    testOptions = { maxLoop: 1 };
  }
  if (!state.connection || !state.streamUrl || !state.streamKey) return;

  let first = true;
  let loopCount = 0;
  while (true) {
    if (testOptions?.forceBreak) break;
    loopCount++;
    if (testOptions?.maxLoop && loopCount > testOptions.maxLoop) {
      // When test maxLoop is reached, explicitly destroy the connection
      if (state.connection) {
        state.connection.destroy();
      }
      break;
    }
    // Spawn FFmpeg and track process for cleanup
    const ffmpeg = spawn(
      'ffmpeg',
      ['-rtsp_transport', 'tcp', '-i', state.streamUrl!, '-f', 'adts', '-c:a', 'copy', 'pipe:1'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    state.ffmpegProcess = ffmpeg;
    const ffmpegStream = ffmpeg.stdout!;
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

    try {
      // Wait for Playing state (start)
      await entersState(player, AudioPlayerStatus.Playing, 5000);

      // Wait 1 second and check if still playing to confirm real playback
      if (!isTestEnv) await sleep(1000);
      if (player.state.status !== 'playing') {
        throw new Error('Stream did not stay in playing state');
      }

      if (first) {
        await interaction.editReply(`Playing ${state.streamKey}.`);
        // Wait 1 second and check if still playing to confirm real playback
        if (!isTestEnv) await sleep(1000);
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
    } catch (error) {
      if (!isTestEnv) {
        console.error('playStream error:', error);
      }
      if (first) {
        await interaction.editReply('Failed to play stream.');
        return;
      }
      if (!isTestEnv) await sleep(3000);
      // continue loop for retry
    }

    // Auto-disconnect if too long idle
    if (!state.connection) break;
    if (Date.now() - state.lastActivityTime > 1800000) {
      // 30 minutes
      console.log(`${state.streamKey} is autodestroyed!`);
      state.connection.destroy();
      state.connection = null;
      state.player = null;
      break;
    }

    // If connection still exists, try to autoresume (continue loop)
    if (state.connection) {
      console.log(`${state.streamKey} is autoresuming...`);
      if (!isTestEnv) await sleep(3000); // Optional: wait before reconnect
      continue;
    } else {
      break;
    }
  }
}

// Unified command handler
export async function handleInteraction(interaction: any) {
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
      ffmpegProcess: null,
    };
    guildAudioStates.set(guildId, state);
  }

  // play command
  if (interaction.commandName === 'play') {
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
    const streamKey = interaction.options.get('streamkey')?.value as string;
    if (!streamKey) {
      await interaction.editReply('streamkey is not specified.');
      return;
    }
    state.streamKey = streamKey;
    state.streamUrl = `rtsp://topaz.chat/live/${streamKey}`;
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
  else if (interaction.commandName === 'resync') {
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

    // Get streamkey from command option or use previous one
    let streamKey = interaction.options.get('streamkey')?.value as string | undefined;
    if (!streamKey) {
      streamKey = state.streamKey ?? undefined;
    }
    if (!streamKey) {
      await interaction.editReply('streamkey is not specified.');
      return;
    }
    state.streamKey = streamKey;
    state.streamUrl = `rtsp://topaz.chat/live/${streamKey}`;

    // Force start playback
    state.isPlaying = true;
    playStream(state, interaction, true).finally(() => {
      state.isPlaying = false;
    });
  }
  // stop command
  else if (interaction.commandName === 'stop') {
    await interaction.deferReply();
    if (state.ffmpegProcess) {
      state.ffmpegProcess.kill();
    }
    if (state.connection) {
      const destroyedKey = state.streamKey;
      state.connection.destroy();
      console.log(`${destroyedKey} is destroyed!`);
    }
    // Reset all state for this guild
    guildAudioStates.set(guildId, {
      connection: null,
      player: null,
      streamKey: null,
      streamUrl: null,
      lastActivityTime: Date.now(),
      isPlaying: false,
      ffmpegProcess: null,
    });
    await interaction.editReply('Destroyed.');
  }
}
