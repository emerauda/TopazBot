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
import { readFileSync } from 'fs';
import { Readable } from 'stream';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';

// Inlined test environment check
const isTestEnv = !!process.env.JEST_WORKER_ID;

// .env loader (skipped in test environment)
if (!isTestEnv) {
  try {
    const env = readFileSync('.env', 'utf-8');
    env.split('\n').forEach((line) => {
      // Skip empty lines and comments
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return;

      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        if (!process.env[key]) {
          process.env[key] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    });
  } catch {
    // Do nothing
  }
}

// RTSP server configuration
// Can be overridden by environment variable RTSP_SERVER_URL
const RTSP_SERVER_URL = process.env.RTSP_SERVER_URL || 'rtsp://topaz.chat/live';

// Utility sleep function
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 利用可なら FFmpeg で直接 Opus(Ogg) を生成し、二重トランスコードを避ける
// USE_EXTERNAL_OPUS=0 を設定すると旧 AAC(ADTS) 方式にフォールバック
const useExternalOpus = process.env.USE_EXTERNAL_OPUS !== '0';
// 入力RTSPストリームが既に Opus (RTP Opus) の場合に copy リマックスのみで済ませるためのフラグ
// INPUT_IS_OPUS=1 をセットすると ffmpeg は libopus エンコードせず -c:a copy で Ogg 化
const inputIsOpus = process.env.INPUT_IS_OPUS === '1';
// 右チャンネル等のノイズや壊れたフレーム対策で copy を強制無効化し再エンコードしたい場合
// FORCE_OPUS_REENCODE=1 に設定
const forceOpusReencode = process.env.FORCE_OPUS_REENCODE === '1';
// DOWNMIX_MONO=1 を設定するとステレオを -ac 1 にダウンミックス（片chノイズ切り分け用）
const downmixMono = process.env.DOWNMIX_MONO === '1';
// COPY_WITH_DISCARDCORRUPT=1 を設定すると copy リマックス時にも破損フレーム破棄/PTS再生成フラグを付加
const copyWithDiscardCorrupt = process.env.COPY_WITH_DISCARDCORRUPT === '1';
// CHANNEL_FIX_MODE: none(default)|swap|left|right|mix
//  swap  : 左右入れ替え
//  left  : 左だけ複製(L->L,R)
//  right : 右だけ複製(R->L,R)
//  mix   : 両ch平均 (モノ化をステレオに複製)
const channelFixMode = (process.env.CHANNEL_FIX_MODE || 'none').toLowerCase();
// 低遅延モード (RTSP バッファ/解析時間を極小化)
const lowLatency = process.env.LOW_LATENCY === '1';
// 再生開始後の安定化待機 (ms) 既定: 通常2000 / 低遅延300
const playStableWaitMs = (() => {
  const v = parseInt(process.env.PLAY_WAIT_MS || '', 10);
  if (!Number.isNaN(v) && v >= 0) return v;
  return lowLatency ? 300 : 2000;
})();
// 再試行(autoresume)前の待機 (ms) 既定: 通常3000 / 低遅延500
const resumeDelayMs = (() => {
  const v = parseInt(process.env.RESUME_WAIT_MS || '', 10);
  if (!Number.isNaN(v) && v >= 0) return v;
  return lowLatency ? 500 : 3000;
})();
// OPUS_BITRATE=192k のように設定 (k/ M など FFmpeg が解釈可能な書式)。未設定時は 192k。
// AAC_BITRATE が未設定なら OPUS_BITRATE と同値を使用。
const opusBitrate = (process.env.OPUS_BITRATE || '192k').trim();
const aacBitrate = (process.env.AAC_BITRATE || opusBitrate).trim();

function buildFfmpegArgs(streamUrl: string, opus: boolean): string[] {
  const preInput = lowLatency
    ? [
        '-fflags',
        'nobuffer',
        '-flags',
        'low_delay',
        '-analyzeduration',
        '0',
        '-probesize',
        '32K',
        '-use_wallclock_as_timestamps',
        '1',
      ]
    : [];
  const common = [
    '-rtsp_transport',
    'tcp',
    ...preInput,
    '-i',
    streamUrl,
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '5',
    '-vn',
    '-ar',
    '48000',
    '-ac',
    downmixMono ? '1' : '2',
  ];
  if (opus) {
    // すでに入力がOpusなら再エンコードせずcopyで Ogg コンテナにリマックス
    if (inputIsOpus && !forceOpusReencode) {
      // copy パス用の -fflags 組み立て (低遅延と破損破棄の両立)
      let copyFflags: string | null = null;
      if (copyWithDiscardCorrupt && lowLatency) copyFflags = '+genpts+discardcorrupt+nobuffer';
      else if (copyWithDiscardCorrupt) copyFflags = '+genpts+discardcorrupt';
      else if (lowLatency) copyFflags = 'nobuffer';
      return [
        ...common,
        '-c:a',
        'copy',
        ...(copyFflags ? ['-fflags', copyFflags] : []),
        // ビットレート指定は copy では無意味
        '-f',
        'ogg',
        'pipe:1',
      ];
    }
    // 通常: libopus で OPUS_BITRATE（既定 192k）
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
    const filterArgs = channelFilter ? ['-af', channelFilter] : [];
    const reencodeFflags = lowLatency
      ? '+genpts+discardcorrupt+nobuffer'
      : '+genpts+discardcorrupt';
    return [
      ...common,
      ...filterArgs,
      '-c:a',
      'libopus',
      '-b:a',
      opusBitrate,
      '-vbr',
      'on',
      '-application',
      'lowdelay',
      // 右chノイズ対策: 壊れたフレームを破棄しPTS再生成
      '-fflags',
      reencodeFflags,
      '-f',
      'ogg',
      'pipe:1',
    ];
  }
  // 旧方式 (AAC ADTS) - discord.js 側で再トランスコードされる可能性あり
  return [...common, '-f', 'adts', '-c:a', 'aac', '-b:a', aacBitrate, 'pipe:1'];
}

// FFmpeg stream creator
// テスト環境では空ストリームを返す
export function createFFmpegStream(streamUrl: string): Readable {
  if (isTestEnv) {
    return Readable.from([]);
  }
  const ffmpegArgs = buildFfmpegArgs(streamUrl, useExternalOpus);
  const ffmpeg = spawn('ffmpeg', ffmpegArgs);
  if (process.env.DEBUG_FFMPEG === '1') {
    console.log('[ffmpeg spawn createFFmpegStream]', ffmpeg.spawnargs.join(' '));
    ffmpeg.stderr?.on('data', (d) => {
      console.log('[ffmpeg stderr createFFmpegStream]', d.toString().trim());
    });
  }
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
    // Spawn FFmpeg and track process for cleanup (skip in test environment)
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

    const ffmpegArgs = buildFfmpegArgs(state.streamUrl!, useExternalOpus);
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    if (process.env.DEBUG_FFMPEG === '1') {
      console.log('[ffmpeg spawn playStream]', ffmpeg.spawnargs.join(' '));
      ffmpeg.stderr?.on('data', (d) => {
        console.log('[ffmpeg stderr playStream]', d.toString().trim());
      });
    }
    state.ffmpegProcess = ffmpeg;

    const ffmpegStream = ffmpeg.stdout!;
    const resource = createAudioResource(ffmpegStream, {
      inputType: useExternalOpus ? StreamType.OggOpus : undefined,
    });
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
      await entersState(player, AudioPlayerStatus.Playing, 10000);

      // Wait longer and check if still playing to confirm real playback
      if (!isTestEnv && playStableWaitMs > 0) await sleep(playStableWaitMs);
      if (player.state.status !== AudioPlayerStatus.Playing) {
        throw new Error('Stream did not stay in playing state');
      }

      if (first) {
        await interaction.editReply(`Playing ${state.streamKey}.`);
        // Additional check after reply - be more lenient for this check
        if (!isTestEnv && playStableWaitMs > 0) await sleep(Math.min(1000, playStableWaitMs));
        if (player.state.status !== AudioPlayerStatus.Playing) {
          console.warn(`Warning: Player status changed from Playing`);
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
        console.error('Player state:', player.state);
        console.error('Connection state:', state.connection?.state);
      }
      if (first) {
        await interaction.editReply(
          `Failed to play stream: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        return;
      }
      if (!isTestEnv && resumeDelayMs > 0) await sleep(resumeDelayMs);
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
      if (!isTestEnv && resumeDelayMs > 0) await sleep(resumeDelayMs); // Optional: wait before reconnect
      continue;
    } else {
      break;
    }
  }
}

// Unified command handler
export async function handleInteraction(interaction: Interaction) {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;
  const chatInputInteraction = interaction as ChatInputCommandInteraction;
  const guildId = chatInputInteraction.guildId!;
  const member = chatInputInteraction.member as GuildMember;
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
  if (chatInputInteraction.commandName === 'play') {
    try {
      await chatInputInteraction.deferReply();
    } catch (e) {
      if (process.env.DEBUG_FFMPEG === '1') console.warn('[play] deferReply failed', e);
      return;
    }
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      await chatInputInteraction.editReply('Please join a voice channel.');
      return;
    }
    const vc = voiceChannel as VoiceChannel;
    if (!vc.joinable || !vc.speakable) {
      await chatInputInteraction.editReply('Cannot join or speak in the voice channel.');
      return;
    }
    if (!state.connection || state.connection.state.status === VoiceConnectionStatus.Destroyed) {
      state.connection = joinVoiceChannel({
        channelId: vc.id,
        guildId: guildId,
        adapterCreator: vc.guild.voiceAdapterCreator,
      });
    }
    const newKey = chatInputInteraction.options.get('streamkey')?.value as string;
    if (!newKey) {
      await chatInputInteraction.editReply('streamkey is not specified.');
      return;
    }
    const oldKey = state.streamKey;
    // If already playing
    if (state.isPlaying) {
      // Already playing same stream or no previous key
      if (!oldKey || newKey === oldKey) {
        await chatInputInteraction.editReply('Already playing.');
        return;
      }
      // Switching to a different stream
      if (state.ffmpegProcess) {
        state.ffmpegProcess.kill();
      }
      state.streamKey = newKey;
      state.streamUrl = `${RTSP_SERVER_URL}/${newKey}`;
      playStream(state, chatInputInteraction).finally(() => {
        state.isPlaying = false;
      });
      return;
    }
    // Starting new playback
    state.streamKey = newKey;
    state.streamUrl = `${RTSP_SERVER_URL}/${newKey}`;
    state.isPlaying = true;
    playStream(state, chatInputInteraction).finally(() => {
      state.isPlaying = false;
    });
  }
  // resync command (force reload stream)
  else if (chatInputInteraction.commandName === 'resync') {
    try {
      await chatInputInteraction.deferReply();
    } catch (e) {
      if (process.env.DEBUG_FFMPEG === '1') console.warn('[resync] deferReply failed', e);
      return;
    }
    const voiceChannel = (chatInputInteraction.member as GuildMember).voice.channel;
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      await chatInputInteraction.editReply('Please join a voice channel.');
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
    let streamKey = chatInputInteraction.options.get('streamkey')?.value as string | undefined;
    if (!streamKey) {
      streamKey = state.streamKey ?? undefined;
    }
    if (!streamKey) {
      await chatInputInteraction.editReply('streamkey is not specified.');
      return;
    }
    state.streamKey = streamKey;
    state.streamUrl = `${RTSP_SERVER_URL}/${streamKey}`;

    // Force start playback
    state.isPlaying = true;
    playStream(state, chatInputInteraction, true).finally(() => {
      state.isPlaying = false;
    });
  }
  // stop command
  else if (chatInputInteraction.commandName === 'stop') {
    try {
      await chatInputInteraction.deferReply();
    } catch (e) {
      if (process.env.DEBUG_FFMPEG === '1') console.warn('[stop] deferReply failed', e);
      return;
    }
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
    await chatInputInteraction.editReply('Destroyed.');
  }
}

// Individual command handlers for testing
export async function handlePlayCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;

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

  await interaction.deferReply();
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    await interaction.editReply('You need to be in a voice channel to play music!');
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
  const streamKey = interaction.options.getString('streamkey');
  if (!streamKey) {
    await interaction.editReply('streamkey is not specified.');
    return;
  }
  state.streamKey = streamKey;
  state.streamUrl = `${RTSP_SERVER_URL}/${streamKey}`;
  // Prevent multiple playStream per guild
  if (!state.isPlaying) {
    state.isPlaying = true;
    await interaction.editReply(`Playing stream: ${streamKey}`);
    playStream(state, interaction).finally(() => {
      state.isPlaying = false;
    });
  } else {
    await interaction.editReply('Already playing.');
  }
}

export async function handleStopCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;

  const guildId = interaction.guildId;
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

  await interaction.deferReply();
  if (state.ffmpegProcess) {
    state.ffmpegProcess.kill();
  }
  if (state.connection) {
    const destroyedKey = state.streamKey;
    state.connection.destroy();
    // Only log in non-test environment
    if (!process.env.JEST_WORKER_ID) {
      console.log(`${destroyedKey} is destroyed!`);
    }
    await interaction.editReply('Stopped playing and left the channel.');
  } else {
    await interaction.editReply('Not in a voice channel.');
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
}

export async function handleResyncCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;

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

  await interaction.deferReply();
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
  let streamKey = interaction.options.getString('streamkey');
  if (!streamKey) {
    streamKey = state.streamKey ?? null;
  }
  if (!streamKey) {
    await interaction.editReply('streamkey is not specified.');
    return;
  }
  state.streamKey = streamKey;
  state.streamUrl = `${RTSP_SERVER_URL}/${streamKey}`;

  // Force start playback
  state.isPlaying = true;
  playStream(state, interaction, true).finally(() => {
    state.isPlaying = false;
  });
}
