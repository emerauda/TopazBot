# TopazBot video relay (video-stream branch) — experimental

Relays a TopazChat RTSP video stream into a Discord voice channel as a Go Live
broadcast, using `@dank074/discord-video-stream` and `discord.js-selfbot-v13`.

## ⚠️ Ban risk

Discord blocks video from **bot** accounts. Video streaming therefore requires
a **user token (selfbot)**. Automating a user account violates Discord's Terms
of Service and can get it **permanently banned**.

- Use a **throwaway account only**, never your main.
- This branch is separate from `main` (the audio bot), which uses a normal bot
  token and is fully ToS-compliant.

## Setup

```bash
git checkout video-stream
npm install
cp .env.example .env
# fill in USER_TOKEN, VIDEO_GUILD_ID, VIDEO_CHANNEL_ID, STREAM_KEY
npm run video
```

### FFmpeg requirement

`@dank074/discord-video-stream` v6 uses `zeromq` internally to control the
encoder. A recent FFmpeg build with `libzmq` support is required:

```bash
ffmpeg -filters 2>/dev/null | grep zmq   # must show a "zmq" line
```

If your distro's ffmpeg is missing it, download a static build
(`ffmpeg.org/download.html` or `johnvansickle.com/ffmpeg/`) and put it on `PATH`.

## Environment variables

See `.env.example`. Required: `USER_TOKEN`, `VIDEO_GUILD_ID`, `VIDEO_CHANNEL_ID`,
`STREAM_KEY`. Optional: `RTSP_SERVER_URL`, `VIDEO_WIDTH/HEIGHT/FPS/BITRATE/
BITRATE_MAX/CODEC`, `LOW_LATENCY`, `DEBUG_FFMPEG`, and `NO_TRANSCODE` (below).

## VPS-side no-transcode mode (`NO_TRANSCODE=1`)

When enabled, the VPS just remuxes the RTSP stream — no video re-encode — and
Discord receives the frames verbatim. CPU usage drops dramatically (from a full
H.264 encode per frame to near zero).

**This only works when OBS is configured to already emit Discord-compatible
H.264.** If it isn't, Discord will glitch or refuse the stream — leave
`NO_TRANSCODE=0` in that case.

### Required OBS settings (Discord Go Live compatible H.264)

Set OBS to **Advanced** output mode and configure the streaming encoder as
follows. These settings match the values in `.env.example` (1080p / 30 fps).

#### Output → Streaming — x264

| Setting                   | Value                              | Why                                     |
| ------------------------- | ---------------------------------- | --------------------------------------- |
| Encoder                   | x264                               |                                         |
| Rate Control              | **CBR**                            | Discord prefers CBR                     |
| Bitrate                   | **5000–6000 kbps**                 | Go Live cap is ~8 Mbps                  |
| Keyframe Interval         | **1 s**                            | Never 0/auto; short GOP for low latency |
| CPU Usage Preset          | veryfast                           | Balance encode delay and quality        |
| Profile                   | **baseline** (safest) or main      | Discord decodes these reliably          |
| Tune                      | **zerolatency**                    | Disables lookahead and B-frames         |
| x264 Options (Additional) | `bframes=0 ref=1 scenecut=0 aud=1` | No B-frames, mark packet boundaries     |

#### Output → Streaming — NVIDIA NVENC H.264

| Setting              | Value                    |
| -------------------- | ------------------------ |
| Rate Control         | CBR                      |
| Bitrate              | 5000–6000 kbps           |
| Keyframe Interval    | 1 s                      |
| Preset               | P3 (Low Latency Quality) |
| Tuning               | Low Latency              |
| Profile              | main                     |
| Look-ahead           | OFF                      |
| Psycho Visual Tuning | OFF                      |
| Max B-frames         | **0**                    |

#### Video tab

- Output (Scaled) Resolution: **1920×1080** or 1280×720 (match `VIDEO_WIDTH`/`VIDEO_HEIGHT`)
- Common FPS Values: **30** (match `VIDEO_FPS`)
- Downscale Filter: Bicubic

#### Advanced tab

- Color Format: **NV12** (or I420)
- Color Space: **Rec. 709**
- Color Range: **Limited**

After changing settings restart the OBS stream, then in Discord run the bot
with `NO_TRANSCODE=1`. Check the log for `noTranscoding=true` on startup.

## Troubleshooting

- **Frozen or glitchy video with `NO_TRANSCODE=1`** — OBS is not emitting
  Discord-compatible H.264. Recheck the settings above, or leave `NO_TRANSCODE`
  off. Common culprits: B-frames enabled, keyframe interval > 2 s, VBR/CRF,
  wrong pixel format, high profile.
- **`ffmpeg exited with code 1`** — usually a missing `libzmq` build (see
  above) or an unreachable RTSP URL. Set `DEBUG_FFMPEG=1` to see the full
  ffmpeg output.
- **Discord doesn't show the Go Live indicator** — the selfbot token is
  invalid or the account was flagged. Never reuse a token from a compromised
  account.
