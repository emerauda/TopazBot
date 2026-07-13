import {
  CommandInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  ChannelType,
  VoiceChannel,
  Interaction,
} from 'discord.js';
import type { VoiceConnection, AudioPlayer as AudioPlayerType } from '@discordjs/voice';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
} from '@discordjs/voice';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { loadEnvFile } from './env';

// Inlined test environment check
const isTestEnv = !!process.env.JEST_WORKER_ID;

// .env loader (skipped in test environment)
loadEnvFile();

// RTSP server configuration
// Can be overridden by environment variable RTSP_SERVER_URL
const RTSP_SERVER_URL = process.env.RTSP_SERVER_URL || 'rtsp://topaz.chat/live';

// Utility sleep function
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// When available, let FFmpeg produce Opus (Ogg) directly to avoid double transcoding.
// Set USE_EXTERNAL_OPUS=0 to fall back to the legacy AAC (ADTS) mode.
const useExternalOpus = process.env.USE_EXTERNAL_OPUS !== '0';
// When the input RTSP stream is already Opus (RTP Opus), remux with -c:a copy only.
// Set INPUT_IS_OPUS=1 to skip the libopus re-encode and remux into Ogg.
const inputIsOpus = process.env.INPUT_IS_OPUS === '1';
// Set FORCE_OPUS_REENCODE=1 to disable the copy path and force a re-encode
// (e.g. to work around noisy/broken frames or to apply channel filters).
const forceOpusReencode = process.env.FORCE_OPUS_REENCODE === '1';
// Set DOWNMIX_MONO=1 to downmix stereo to mono (-ac 1), useful for isolating one-channel noise.
const downmixMono = process.env.DOWNMIX_MONO === '1';
// Set COPY_WITH_DISCARDCORRUPT=1 to also discard corrupt frames / regenerate PTS in copy mode.
const copyWithDiscardCorrupt = process.env.COPY_WITH_DISCARDCORRUPT === '1';
// CHANNEL_FIX_MODE: none(default)|swap|left|right|mix
//  swap  : swap left and right
//  left  : duplicate left (L->L,R)
//  right : duplicate right (R->L,R)
//  mix   : average both channels (mono mixed back to stereo)
const channelFixMode = (process.env.CHANNEL_FIX_MODE || 'none').toLowerCase();
// Low latency mode (minimize RTSP buffering / analysis time)
const lowLatency = process.env.LOW_LATENCY === '1';
// Stabilization wait after playback starts (ms). Default: 2000, or 300 in low latency mode.
const playStableWaitMs = (() => {
  const v = parseInt(process.env.PLAY_WAIT_MS || '', 10);
  if (!Number.isNaN(v) && v >= 0) return v;
  return lowLatency ? 300 : 2000;
})();
// Wait before a retry (autoresume) attempt (ms). Default: 3000, or 500 in low latency mode.
const resumeDelayMs = (() => {
  const v = parseInt(process.env.RESUME_WAIT_MS || '', 10);
  if (!Number.isNaN(v) && v >= 0) return v;
  return lowLatency ? 500 : 3000;
})();
// Set like OPUS_BITRATE=192k (any format FFmpeg accepts, e.g. k/M). Defaults to 192k.
// AAC_BITRATE falls back to OPUS_BITRATE when unset.
const opusBitrate = (process.env.OPUS_BITRATE || '192k').trim();
const aacBitrate = (process.env.AAC_BITRATE || opusBitrate).trim();
// Auto-disconnect after this long without confirmed playback (ms)
const IDLE_DISCONNECT_MS = 1800000; // 30 minutes

// Filter options cannot be applied while copy-remuxing, so warn at startup if they are set.
if (
  !isTestEnv &&
  useExternalOpus &&
  inputIsOpus &&
  !forceOpusReencode &&
  (downmixMono || channelFixMode !== 'none')
) {
  console.warn(
    '[config] DOWNMIX_MONO / CHANNEL_FIX_MODE have no effect while INPUT_IS_OPUS=1 uses copy remux. Set FORCE_OPUS_REENCODE=1 to apply them.'
  );
}

// Set when ffmpeg reports that the input cannot be copy-remuxed into Ogg,
// i.e. INPUT_IS_OPUS=1 was configured but the RTSP source is not actually
// Opus (TopazChat, for example, delivers AAC). Later attempts then re-encode.
let copyRemuxUnsupported = false;

export function disableCopyRemux(): void {
  copyRemuxUnsupported = true;
}

export function buildFfmpegArgs(streamUrl: string, opus: boolean): string[] {
  const useCopy = opus && inputIsOpus && !forceOpusReencode && !copyRemuxUnsupported;

  // -fflags (genpts/discardcorrupt/nobuffer) are demuxer flags, so they must be
  // placed before -i (input side). They have no effect on the output side.
  const inputFflags: string[] = [];
  if (opus) {
    if (useCopy) {
      // In copy mode, discard corrupt frames / regenerate PTS only when requested
      if (copyWithDiscardCorrupt) inputFflags.push('+genpts', '+discardcorrupt');
    } else {
      // When re-encoding, always discard corrupt frames and regenerate PTS
      // (mitigates right-channel noise from broken frames)
      inputFflags.push('+genpts', '+discardcorrupt');
    }
  }
  if (lowLatency) inputFflags.push('+nobuffer');

  // Note: -use_wallclock_as_timestamps is deliberately NOT used — it stamps
  // packets with their arrival time, so network jitter produces backward
  // timestamps ("Queue input is backward in time" / non-monotonic DTS spam).
  // -max_delay 0 disables the RTSP demuxer's reorder buffer (default 0.5s),
  // which is safe because the transport is TCP (already ordered).
  const preInput = [
    ...(lowLatency
      ? ['-flags', 'low_delay', '-analyzeduration', '0', '-probesize', '32K', '-max_delay', '0']
      : []),
    ...(inputFflags.length ? ['-fflags', inputFflags.join('')] : []),
  ];
  // The ogg muxer buffers up to 1 SECOND per page by default (page_duration),
  // which becomes permanent extra latency on a live stream. In low latency
  // mode emit one page per opus frame (20ms) and flush each packet.
  const oggMuxArgs = lowLatency ? ['-page_duration', '20000', '-flush_packets', '1'] : [];
  // Note: RTSP reconnection is handled by the retry loop in playStream().
  // (-reconnect and friends are HTTP-only options, so they are not used here.)
  // -nostats is important: without it ffmpeg keeps writing progress to stderr,
  // which can fill the pipe buffer and stall the process when nobody reads it.
  const common = [
    '-hide_banner',
    '-nostats',
    '-loglevel',
    'warning',
    '-rtsp_transport',
    'tcp',
    ...preInput,
    '-i',
    streamUrl,
    '-vn',
  ];
  if (opus) {
    // Input is already Opus: remux into an Ogg container with copy instead of re-encoding.
    // (-ar/-ac do not apply to a copied stream, so they are omitted here.)
    if (useCopy) {
      return [...common, '-c:a', 'copy', ...oggMuxArgs, '-f', 'ogg', 'pipe:1'];
    }
    // Normal path: encode with libopus at OPUS_BITRATE (default 192k)
    const channelFilter = (() => {
      switch (channelFixMode) {
        case 'swap':
          return 'pan=stereo|c0=c1|c1=c0';
        case 'left':
          return 'pan=stereo|c0=c0|c1=c0';
        case 'right':
          return 'pan=stereo|c0=c1|c1=c1';
        case 'mix':
          return 'pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1';
        default:
          return null;
      }
    })();
    // aresample=async=1 smooths RTSP timestamp jitter into a continuous
    // timeline before the encoder (prevents backward-in-time frames)
    const filterChain = ['aresample=async=1', ...(channelFilter ? [channelFilter] : [])].join(',');
    return [
      ...common,
      '-ar',
      '48000',
      '-ac',
      downmixMono ? '1' : '2',
      '-af',
      filterChain,
      '-c:a',
      'libopus',
      '-b:a',
      opusBitrate,
      '-vbr',
      'on',
      '-application',
      'lowdelay',
      ...oggMuxArgs,
      '-f',
      'ogg',
      'pipe:1',
    ];
  }
  // Legacy mode (AAC ADTS) - discord.js may transcode this again on its side
  return [
    ...common,
    '-ar',
    '48000',
    '-ac',
    downmixMono ? '1' : '2',
    '-f',
    'adts',
    '-c:a',
    'aac',
    '-b:a',
    aacBitrate,
    'pipe:1',
  ];
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
  // Generation number of the playback session. It is bumped whenever playStream
  // starts or /stop runs, and stale playStream loops detect the change and exit safely.
  epoch?: number;
}

export const guildAudioStates: Map<string, GuildAudioState> = new Map();

function getOrCreateGuildState(guildId: string): GuildAudioState {
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

// editReply can reject (expired token, API errors); never let that break playback.
async function safeEditReply(interaction: CommandInteraction, content: string): Promise<void> {
  try {
    await interaction.editReply(content);
  } catch (err) {
    if (!isTestEnv) console.warn('editReply failed:', err);
  }
}

// Wait until the stream ends (player goes Idle). A single overall timeout would cut off
// healthy long-running streams, so instead wake up every 60s just to re-check the state.
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

// Join a voice channel and attach the standard recovery handler.
// A Disconnected connection may be a channel move (Discord re-signals within
// a moment) or a real kick/channel deletion — only the latter is destroyed,
// which in turn makes the playStream loop exit and clean up.
function createVoiceConnection(vc: VoiceChannel, guildId: string) {
  const connection = joinVoiceChannel({
    channelId: vc.id,
    guildId,
    adapterCreator: vc.guild.voiceAdapterCreator,
  });
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
      // Reconnecting (e.g. moved to another channel) — leave it alone
    } catch {
      // Real disconnect (kicked / channel deleted) — release the connection
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
    }
  });
  return connection;
}

// Stop every guild session and release all resources (used on process shutdown)
export function shutdownAllGuilds(): void {
  for (const state of guildAudioStates.values()) {
    state.epoch = (state.epoch ?? 0) + 1; // invalidate running loops
    killFfmpeg(state);
    stopPlayer(state);
    if (state.connection) {
      try {
        state.connection.destroy();
      } catch {
        // already destroyed
      }
      state.connection = null;
    }
    state.player = null;
    state.isPlaying = false;
  }
  guildAudioStates.clear();
}

// Fire-and-forget launcher for playStream. Always go through here: an uncaught
// rejection would otherwise crash the whole process.
function startPlayStream(
  state: GuildAudioState,
  interaction: CommandInteraction,
  isResync = false
): void {
  playStream(state, interaction, isResync).catch((err) => {
    if (!isTestEnv) console.error('playStream failed:', err);
  });
}

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
  // Take ownership of this state. If epoch changes later, a newer session has
  // replaced this one and this loop must exit without touching anything.
  const epoch = (state.epoch ?? 0) + 1;
  state.epoch = epoch;
  const isStale = () => state.epoch !== epoch;

  if (!state.connection || !state.streamUrl || !state.streamKey) return;

  state.isPlaying = true;
  try {
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
      if (isTestEnv) {
        // In test environment, simulate successful play and return early
        if (first) {
          await interaction.editReply(`Playing ${state.streamKey}.`);
          first = false;
        }
        if (state.connection) {
          state.connection.destroy();
        }
        break;
      }
      if (isStale() || !state.connection) break;

      // Spawn FFmpeg and track the process for cleanup.
      // stderr is always consumed (an unread pipe would fill up and block
      // ffmpeg once its 64KB buffer is full) and scanned for the copy-mode
      // failure marker; the content is only logged when debugging.
      const debugFfmpeg = process.env.DEBUG_FFMPEG === '1';
      const ffmpegArgs = buildFfmpegArgs(state.streamUrl!, useExternalOpus);
      const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      if (debugFfmpeg) {
        console.log('[ffmpeg spawn playStream]', ffmpeg.spawnargs.join(' '));
      }
      ffmpeg.stderr?.on('data', (d) => {
        const msg = d.toString();
        if (debugFfmpeg) console.log('[ffmpeg stderr playStream]', msg.trim());
        // INPUT_IS_OPUS=1 but the source does not actually deliver Opus: the
        // ogg muxer rejects the copied stream. Re-encode from the next attempt.
        if (!copyRemuxUnsupported && msg.includes('Unsupported codec id')) {
          disableCopyRemux();
          console.warn(
            '[config] INPUT_IS_OPUS=1 but the RTSP source is not Opus — falling back to libopus re-encode. Set INPUT_IS_OPUS=0 to remove this warning.'
          );
        }
      });
      state.ffmpegProcess = ffmpeg;

      const resource = createAudioResource(ffmpeg.stdout!, {
        inputType: useExternalOpus ? StreamType.OggOpus : undefined,
      });
      const player = createAudioPlayer();
      player.play(resource);
      state.player = player;
      state.connection.subscribe(player);

      if (first) {
        if (isResync) {
          console.log(`${state.streamKey} is resyncing...`);
        } else {
          console.log(`${state.streamKey} is playing!`);
        }
      }

      try {
        // Wait for Playing state (start)
        await entersState(player, AudioPlayerStatus.Playing, 10000);

        // Wait longer and check if still playing to confirm real playback
        if (playStableWaitMs > 0) await sleep(playStableWaitMs);
        if (player.state.status !== AudioPlayerStatus.Playing) {
          throw new Error('Stream did not stay in playing state');
        }
        // Record confirmed playback (reference point for the auto-disconnect timer)
        state.lastActivityTime = Date.now();

        if (first) {
          await safeEditReply(interaction, `Playing ${state.streamKey}.`);
          if (isResync) {
            console.log(`${state.streamKey} is resynced!`);
          }
          first = false;
        } else {
          console.log(`${state.streamKey} is autoresumed!`);
        }
        // Wait for the stream to end (no overall cap — a healthy stream may play for hours)
        await waitForPlaybackEnd(player, isStale);
        state.lastActivityTime = Date.now(); // it was playing until just now
        if (!isStale()) console.log(`${state.streamKey} is stopped!`);
      } catch (error) {
        if (!isStale()) {
          console.error('playStream error:', error);
          console.error('Player state:', player.state);
          console.error('Connection state:', state.connection?.state);
        }
        if (first) {
          await safeEditReply(
            interaction,
            `Failed to play stream: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          // Nothing will manage this connection anymore — leave the channel
          // instead of sitting there silently.
          if (
            !isStale() &&
            state.connection &&
            state.connection.state.status !== VoiceConnectionStatus.Destroyed
          ) {
            state.connection.destroy();
            state.connection = null;
            state.player = null;
          }
          return;
        }
        if (resumeDelayMs > 0) await sleep(resumeDelayMs);
        // continue loop for retry
      } finally {
        // Make sure the ffmpeg spawned by this iteration is gone
        // (prevents piling up processes across retries)
        try {
          ffmpeg.kill();
        } catch {
          // already dead
        }
        if (state.ffmpegProcess === ffmpeg) state.ffmpegProcess = null;
      }

      // Exit if this session was replaced by /stop, /resync or a stream switch
      if (isStale()) break;
      if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
        break;
      }
      // Auto-disconnect after IDLE_DISCONNECT_MS without confirmed playback.
      // (lastActivityTime is only updated on successful playback, so a healthy
      // long-running stream never reaches this point.)
      if (Date.now() - state.lastActivityTime > IDLE_DISCONNECT_MS) {
        console.log(`${state.streamKey} is autodestroyed!`);
        state.connection.destroy();
        state.connection = null;
        state.player = null;
        break;
      }

      console.log(`${state.streamKey} is autoresuming...`);
      if (resumeDelayMs > 0) await sleep(resumeDelayMs);
    }
  } finally {
    // Only clear the flag if this session is still the latest one
    if (!isStale()) state.isPlaying = false;
  }
}

// Unified command dispatcher — each command is implemented once in handle*Command
export async function handleInteraction(interaction: Interaction) {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;
  switch (interaction.commandName) {
    case 'play':
      return handlePlayCommand(interaction);
    case 'resync':
      return handleResyncCommand(interaction);
    case 'stop':
      return handleStopCommand(interaction);
  }
}

// play command
export async function handlePlayCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  const guildId = interaction.guildId;
  const state = getOrCreateGuildState(guildId);

  try {
    await interaction.deferReply();
  } catch (e) {
    if (process.env.DEBUG_FFMPEG === '1') console.warn('[play] deferReply failed', e);
    return;
  }
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    await interaction.editReply('Please join a voice channel.');
    return;
  }
  const vc = voiceChannel as VoiceChannel;
  if (!vc.joinable || !vc.speakable) {
    await interaction.editReply('Cannot join or speak in the voice channel.');
    return;
  }
  const newKey = interaction.options.getString('streamkey');
  if (!newKey) {
    await interaction.editReply('streamkey is not specified.');
    return;
  }
  const oldKey = state.streamKey;
  if (state.isPlaying) {
    // Already playing same stream or no previous key
    if (!oldKey || newKey === oldKey) {
      await interaction.editReply('Already playing.');
      return;
    }
    // Switching to a different stream: stop the current session first.
    // (The epoch bump inside playStream invalidates the old loop automatically.)
    killFfmpeg(state);
    stopPlayer(state);
  }
  if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
    state.connection = createVoiceConnection(vc, guildId);
  }
  state.streamKey = newKey;
  state.streamUrl = `${RTSP_SERVER_URL}/${newKey}`;
  startPlayStream(state, interaction);
}

// resync command (force reload stream)
export async function handleResyncCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  const guildId = interaction.guildId;
  const state = getOrCreateGuildState(guildId);

  try {
    await interaction.deferReply();
  } catch (e) {
    if (process.env.DEBUG_FFMPEG === '1') console.warn('[resync] deferReply failed', e);
    return;
  }
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    await interaction.editReply('Please join a voice channel.');
    return;
  }
  const vc = voiceChannel as VoiceChannel;

  // Get streamkey from command option or use previous one
  const streamKey = interaction.options.getString('streamkey') ?? state.streamKey;
  if (!streamKey) {
    await interaction.editReply('streamkey is not specified.');
    return;
  }

  // Fully stop the current session before recreating the connection
  killFfmpeg(state);
  stopPlayer(state);
  if (state.connection) {
    state.connection.destroy();
  }
  state.connection = createVoiceConnection(vc, guildId);
  state.streamKey = streamKey;
  state.streamUrl = `${RTSP_SERVER_URL}/${streamKey}`;
  startPlayStream(state, interaction, true);
}

// stop command
export async function handleStopCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  const guildId = interaction.guildId;
  const state = getOrCreateGuildState(guildId);

  try {
    await interaction.deferReply();
  } catch (e) {
    if (process.env.DEBUG_FFMPEG === '1') console.warn('[stop] deferReply failed', e);
    return;
  }
  // Invalidate any running playStream loop, then stop the process and the player
  state.epoch = (state.epoch ?? 0) + 1;
  killFfmpeg(state);
  stopPlayer(state);
  const hadConnection = !!state.connection;
  if (state.connection) {
    const destroyedKey = state.streamKey;
    state.connection.destroy();
    if (!isTestEnv) console.log(`${destroyedKey} is destroyed!`);
  }
  // Reset state in place so that any stale references also observe the reset
  state.connection = null;
  state.player = null;
  state.streamKey = null;
  state.streamUrl = null;
  state.lastActivityTime = Date.now();
  state.isPlaying = false;
  state.ffmpegProcess = null;
  await interaction.editReply(hadConnection ? 'Destroyed.' : 'Not in a voice channel.');
}
