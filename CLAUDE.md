# CLAUDE.md — TopazBot (FetherBot branch)

## Project Overview

A Discord bot that relays a TopazChat RTSP stream into a Discord voice channel.
FFmpeg transcodes RTSP (AAC) → OggOpus, which is sent to Discord via `@discordjs/voice`.

This is the **legacy single-guild branch** (fixed stream key, auto-join via
`voiceStateUpdate`). The multi-guild slash-command version with tests lives on
the **main branch**.

## Architecture

- **`src/index.ts`** — the whole bot (deployed with PM2). The stream key is
  `STREAM + NUMBER` from the environment; command names are `play{N}`,
  `resync{N}`, `stop{N}`.
- **`register.js`** — slash command registration script (reads `.env`, registers
  the `{N}`-suffixed guild-only commands; run with `node register.js [guildId]`).

## Tech Stack

- TypeScript, Node.js (ES2020 target, CommonJS)
- discord.js v14, @discordjs/voice (Voice Gateway v8, DAVE encryption via @snazzah/davey)
- FFmpeg (libopus), @discordjs/opus, sodium-native

## Build & Run

```bash
npm install
npm run build                # tsc → dist/
npm start                    # node dist/index.js
npm run dev                  # ts-node src/index.ts
node register.js [guildId]   # register slash commands
```

## Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token (required) |
| `STREAM` | Stream name prefix (required, e.g. `maitake`) |
| `NUMBER` | Bot number used as the command-name suffix (optional, e.g. `2`; empty → `play`/`resync`/`stop`) |
| `TARGET_VOICE_CHANNEL_ID` | Voice channel to auto-join (empty disables auto-join) |

## Key Design Decisions

- **Direct OggOpus output**: FFmpeg transcodes AAC→Opus and outputs `-f ogg`;
  passing `StreamType.OggOpus` to discord.js avoids a second prism-media transcode.
- **Low-latency flags**: `-fflags nobuffer -flags low_delay` on the input side.
- **Session epochs**: every `playStream()` start and `stopGuildSession()` bumps
  `state.epoch`; stale loops observe the change and exit. This is how stop,
  resync and the empty-channel auto-leave actually terminate playback.
- **FFmpeg lifecycle**: the per-iteration process is killed in a `finally`
  block; stderr is consumed continuously and progress is suppressed with
  `-nostats` so the pipe buffer can never stall ffmpeg.
- **Auto-resume**: playback failures retry every 10s while the connection is alive.
- **Auto join/leave**: `voiceStateUpdate` watches `TARGET_VOICE_CHANNEL_ID`.
- **Disconnect recovery**: connections get the standard Disconnected handler
  (5s grace for channel moves, destroy on real kicks → the loop exits).

## Common Issues

- **Voice Gateway version**: Discord requires Voice Gateway v8 — `@discordjs/voice`
  must be `^0.19.2` or newer (older versions fail with a
  `connecting → signalling` loop).
- **`-c:a copy -f adts` cannot be used**: the input is AAC but Discord only
  accepts Opus, so transcoding is mandatory.
- **DAVE encryption**: provided by `@snazzah/davey` (a direct dependency).
