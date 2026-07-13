# CLAUDE.md - AI Assistant Context for TopazBot

## Project Overview

TopazBot is a Discord bot that relays RTSP audio streams from TopazChat to Discord voice channels. This is the **main branch** — the multi-guild, slash-command version with comprehensive test coverage, linting, and modular architecture.

## Branch Architecture

- **main branch** (this): Multi-guild support, slash commands (`/play`, `/resync`, `/stop`), Jest tests, ESLint + Prettier, modular `bot.ts` + `index.ts` + `register.ts`
- **FetherBot branch**: Legacy single-guild version (v1.2.x) with hardcoded stream keys (`play1`–`play4`), auto-join via `voiceStateUpdate`, no tests — kept for a separate deployment, not the source of truth

## Tech Stack

| Component | Version |
|---|---|
| Node.js | 22.x (.nvmrc: v22.17.0) |
| TypeScript | ^6.0.3 (ES2020 / CommonJS) |
| discord.js | ^14.26.5 |
| @discordjs/voice | ^0.19.2 (Voice Gateway v8) |
| @discordjs/opus | ^0.10.0 |
| @snazzah/davey | ^0.1.12 (DAVE encryption) |
| sodium-native | ^5.1.0 |
| FFmpeg | system-installed (libopus required) |
| Jest | ^30.4.2 (ts-jest) |
| ESLint | ^10.7.0 (flat config) |
| Prettier | ^3.9.5 |

## Project Structure

```
src/
  index.ts     - Entry point: Client setup, event listeners, login, graceful shutdown
  bot.ts       - Core logic: FFmpeg pipeline, playStream(), handleInteraction(), GuildAudioState
  register.ts  - Slash command registration script
  env.ts       - Shared .env loader (no dotenv dependency)
test/
  *.test.ts    - Jest test files
  tsconfig.json - Editor-facing project so IDEs resolve jest types in tests
```

## Key Design Decisions

### Audio Pipeline
- RTSP (from TopazChat) → FFmpeg → OggOpus → `StreamType.OggOpus` → discord.js → Discord
- `buildFfmpegArgs()` in `bot.ts` (exported for tests) constructs FFmpeg arguments based on env vars
- Supports multiple modes: Opus copy (zero transcode), libopus re-encode, AAC fallback
- Channel fix modes: none, swap, left, right, mix (via `-af pan=...`) — re-encode path only
- `-fflags` (genpts/discardcorrupt/nobuffer) are demuxer flags and must stay before `-i`;
  RTSP reconnection is handled by the retry loop in `playStream()`, not by FFmpeg options
- ffmpeg is spawned with `-nostats`; stderr is always consumed (scanned for the copy-mode
  failure marker, logged when `DEBUG_FFMPEG=1`) — an unread
  stderr pipe would fill up and block ffmpeg (64KB pipe buffer)

### Environment Variables (see .env.example)
- `DISCORD_TOKEN` — Bot token (required)
- `RTSP_SERVER_URL` — Base RTSP URL (default: `rtsp://topaz.chat/live`)
- `USE_EXTERNAL_OPUS` — `1` (default) for OggOpus output, `0` for AAC ADTS fallback
- `INPUT_IS_OPUS` — `1` to copy-remux when the source really delivers Opus; auto-falls back to re-encode on mismatch (TopazChat delivers AAC → keep `0`)
- `FORCE_OPUS_REENCODE` — `1` to force libopus re-encode even when INPUT_IS_OPUS=1
- `LOW_LATENCY` — `1` for nobuffer/analyzeduration=0/probesize=32K/max_delay=0 + 20ms ogg pages
- `OPUS_BITRATE` — Target bitrate (default: `192k`)
- `AAC_BITRATE` — Bitrate for the AAC fallback (defaults to `OPUS_BITRATE`)
- `CHANNEL_FIX_MODE` — `none|swap|left|right|mix` (re-encode path only)
- `DOWNMIX_MONO` — `1` to downmix input to mono (re-encode path only)
- `COPY_WITH_DISCARDCORRUPT` — `1` to discard corrupt frames / regenerate PTS in copy mode
- `PLAY_WAIT_MS` — Stabilization wait after playback starts (default 2000, low-latency 300)
- `RESUME_WAIT_MS` — Wait before an auto-resume retry (default 3000, low-latency 500)
- `DEBUG_FFMPEG` — `1` to log FFmpeg spawn args and stderr

### Per-Guild State & Session Model
- `GuildAudioState` tracks connection, player, streamKey, streamUrl, ffmpegProcess, isPlaying, epoch
- `guildAudioStates` Map keyed by guild ID
- `playStream()` runs a retry loop with auto-resume on stream interruption
- **epoch**: each `playStream()` call (and `/stop`) bumps `state.epoch`; stale loops detect the
  change and exit without touching the state — this is how `/stop`, `/resync` and stream
  switching cancel the previous session (there must never be two loops owning one state)
- Auto-disconnect: the voice connection is destroyed after 30 min *without confirmed playback*
  (`lastActivityTime` is only refreshed when playback succeeds); healthy long streams are never cut
- Command logic lives in `handlePlayCommand` / `handleResyncCommand` / `handleStopCommand`;
  `handleInteraction` is only a dispatcher — do not duplicate command logic elsewhere
- `playStream()` is always started via the internal `startPlayStream()` (catches rejections)
- Connections are created via `createVoiceConnection()`, which attaches the standard
  Disconnected recovery handler (5s grace for channel moves, destroy on real kick)
- `shutdownAllGuilds()` stops all sessions; `index.ts` wires it to SIGINT/SIGTERM so
  PM2 restarts never leave orphan ffmpeg processes or voice connections
- If the first playback attempt fails, the bot replies with the error and leaves the
  voice channel instead of sitting idle

### Test Environment
- `isTestEnv = !!process.env.JEST_WORKER_ID` — bypasses login, .env loading, FFmpeg spawning
- `playStream()` accepts `testOptions: { maxLoop?, forceBreak? }` for controlled test execution
- Tests in `test/` directory, run with `npm test`

## Build & Run Commands

```bash
npm install          # Install dependencies
npm run build        # TypeScript compile (tsc)
npm run start        # Build + run (tsc && node dist/index.js)
npm run dev          # ts-node src/index.ts
npm run register     # Register slash commands
npm test             # Run Jest tests
npm run test:coverage # Tests with coverage report
npm run lint         # ESLint check (src + test)
npm run lint:fix     # ESLint auto-fix (src + test)
npm run format       # Prettier write (src + test)
npm run format:check # Prettier check (src + test)
npm run typecheck    # tsc --noEmit -p tsconfig.eslint.json (src + test + configs)
```

Note: `tsconfig.json` is the build config (src only); `tsconfig.eslint.json` extends it to
cover tests and config files for linting/type-checking.

## Common Issues

### Voice Gateway v8
`@discordjs/voice` must be >= 0.19.0 to support Discord's Voice Gateway v8. Older versions cause `signalling → connecting → signalling` infinite loop.

### FFmpeg Requirements
FFmpeg must have `libopus` encoder. Verify: `ffmpeg -encoders 2>/dev/null | grep libopus`

### DAVE Encryption
Discord requires DAVE (Discord Audio Video Encryption). `@snazzah/davey` ^0.1.12 provides this.

## Coding Conventions

- Strict TypeScript (`"strict": true`)
- ESLint flat config (`eslint.config.ts`) + Prettier
- No dotenv package — shared custom loader in `src/env.ts` (`loadEnvFile()`)
- Exported functions and types for testability
- PM2 for production deployment (graceful shutdown handled via SIGINT/SIGTERM)
