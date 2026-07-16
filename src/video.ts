/**
 * Experimental video relay for TopazBot (video-stream branch).
 *
 * ⚠️ IMPORTANT: Discord blocks video from BOT accounts. Sending video therefore
 * requires a USER account token (selfbot), which is against Discord's Terms of
 * Service and can get the account permanently banned. Use a THROWAWAY account
 * you are willing to lose, never your main one. This is separate from the audio
 * bot (main branch), which uses a normal bot token and is fully ToS-compliant.
 *
 * Pipeline: RTSP (TopazChat) --ffmpeg(TCP, remux)--> MPEG-TS --node-av(re-encode)
 *           --> Discord Go Live, via @dank074/discord-video-stream.
 */
import { Client } from 'discord.js-selfbot-v13';
import { Streamer, prepareStream, playStream, Utils, Encoders } from '@dank074/discord-video-stream';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { readFileSync } from 'fs';

// Minimal .env loader (no dotenv dependency)
(function loadEnv() {
  try {
    const env = readFileSync('.env', 'utf-8');
    env.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) return;
      const [, key, value] = match;
      if (!process.env[key]) process.env[key] = value.replace(/^['"]|['"]$/g, '');
    });
  } catch {
    // Ignore missing .env
  }
})();

// --- Configuration -------------------------------------------------------
// USER (selfbot) token — NOT a bot token. See the warning at the top of the file.
const token = process.env.USER_TOKEN;
if (!token) throw new Error('USER_TOKEN is not set (selfbot user token required for video).');

const guildId = process.env.VIDEO_GUILD_ID;
const channelId = process.env.VIDEO_CHANNEL_ID;
if (!guildId || !channelId) {
  throw new Error('VIDEO_GUILD_ID and VIDEO_CHANNEL_ID must be set.');
}

const streamKey = process.env.STREAM_KEY;
if (!streamKey) throw new Error('STREAM_KEY is not set.');

const RTSP_SERVER_URL = process.env.RTSP_SERVER_URL || 'rtsp://topaz.chat/live';
const STREAM_URL = `${RTSP_SERVER_URL}/${streamKey}`;

// Video encoding parameters (the source is re-encoded to what Discord accepts)
const height = parseInt(process.env.VIDEO_HEIGHT || '1080', 10);
const width = parseInt(process.env.VIDEO_WIDTH || '1920', 10);
const frameRate = parseInt(process.env.VIDEO_FPS || '30', 10);
const bitrateVideo = parseInt(process.env.VIDEO_BITRATE || '5000', 10); // kbps
const bitrateVideoMax = parseInt(process.env.VIDEO_BITRATE_MAX || '7500', 10); // kbps
const videoCodec = Utils.normalizeVideoCodec(process.env.VIDEO_CODEC || 'H264');
const lowLatency = process.env.LOW_LATENCY !== '0';
const debug = process.env.DEBUG_FFMPEG === '1';

// --- FFmpeg RTSP intake --------------------------------------------------
// Pull RTSP over TCP and remux (no re-encode) into MPEG-TS on stdout. The heavy
// H.264 encode is done downstream by prepareStream/node-av. Keeping this stage a
// copy makes it cheap and lets us apply the same low latency flags as the audio
// bot. stderr is always drained so its pipe buffer can never stall ffmpeg.
function spawnRtspRemux(): ChildProcess {
  const args = [
    '-hide_banner',
    '-nostats',
    '-loglevel',
    'warning',
    '-rtsp_transport',
    'tcp',
    ...(lowLatency ? ['-fflags', '+nobuffer', '-flags', 'low_delay', '-probesize', '32K'] : []),
    '-i',
    STREAM_URL,
    '-c',
    'copy',
    '-f',
    'mpegts',
    'pipe:1',
  ];
  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  ff.stderr?.on('data', (d: Buffer) => {
    const msg = d.toString().trim();
    if (debug) console.log('[ffmpeg]', msg);
    else if (/error|failed|invalid/i.test(msg)) console.error('[ffmpeg]', msg);
  });
  return ff;
}

// --- Streaming loop ------------------------------------------------------
const streamer = new Streamer(new Client());
let currentFfmpeg: ChildProcess | null = null;
let stopping = false;

async function streamOnce(): Promise<void> {
  const ffmpeg = spawnRtspRemux();
  currentFfmpeg = ffmpeg;

  const encoder = Encoders.software({
    x264: { preset: 'superfast' },
    x265: { preset: 'superfast' },
  });

  const { command, output } = prepareStream(ffmpeg.stdout!, {
    encoder,
    width,
    height,
    frameRate,
    bitrateVideo,
    bitrateVideoMax,
    videoCodec,
  });

  command.on('error', (err: unknown) => {
    if (!stopping) console.error('encode error:', err);
  });

  try {
    await playStream(output, streamer, { type: 'go-live' });
  } finally {
    try {
      command.kill?.('SIGKILL');
    } catch {
      /* already gone */
    }
    try {
      ffmpeg.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    if (currentFfmpeg === ffmpeg) currentFfmpeg = null;
  }
}

async function main(): Promise<void> {
  await streamer.client.login(token);
  console.log(`Logged in as ${streamer.client.user?.tag}`);
  await streamer.joinVoice(guildId!, channelId!);
  console.log(`Joined voice channel ${channelId} — starting Go Live for ${streamKey}`);

  // Retry loop: if the RTSP stream drops, reconnect after a short delay.
  while (!stopping) {
    try {
      await streamOnce();
      if (stopping) break;
      console.log('Stream ended, reconnecting in 5s...');
    } catch (err) {
      if (stopping) break;
      console.error('Stream error, retrying in 5s:', err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// Graceful shutdown: stop the loop, kill ffmpeg, leave the channel.
function shutdown(signal: NodeJS.Signals): void {
  console.log(`Received ${signal}, shutting down...`);
  stopping = true;
  if (currentFfmpeg) {
    try {
      currentFfmpeg.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
  try {
    streamer.leaveVoice();
  } catch {
    /* not connected */
  }
  void streamer.client.destroy().finally(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
