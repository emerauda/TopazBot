# CLAUDE.md - AI Assistant Context for TopazBot (FetherBot branch)

## Project Overview

TopazBot is a Discord bot that relays RTSP audio streams from TopazChat to Discord voice channels. This is the **FetherBot branch** — the multi-guild, slash-command version with comprehensive test coverage, linting, and modular architecture.

## Branch Architecture

- **FetherBot branch** (this): Multi-guild support, slash commands (`/play`, `/resync`, `/stop`), Jest tests, ESLint + Prettier, modular `bot.ts` + `index.ts` + `register.ts`
- **main branch**: Single-guild, hardcoded stream keys (`play1`–`play4`), auto-join via `voiceStateUpdate`, no tests — a separate deployment

## Tech Stack

| Component | Version |
|---|---|
| Node.js | 22.x (.nvmrc: v22.17.0) |
| TypeScript | ^5.9.3 (ES2020 / CommonJS) |
| discord.js | ^14.25.1 |
| @discordjs/voice | ^0.19.2 (Voice Gateway v8) |
| @discordjs/opus | ^0.10.0 |
| @snazzah/davey | ^0.1.10 (DAVE encryption) |
| sodium-native | ^5.1.0 |
| FFmpeg | system-installed (libopus required) |
| Jest | ^30.2.0 (ts-jest) |
| ESLint | ^9.37.0 (flat config) |
| Prettier | ^3.6.2 |

## Project Structure

```
src/
  index.ts     - Entry point: Client setup, .env loading, event listeners, login
  bot.ts       - Core logic: FFmpeg pipeline, playStream(), handleInteraction(), GuildAudioState
  register.ts  - Slash command registration script
test/
  *.test.ts    - Jest test files
```

## Key Design Decisions

### Audio Pipeline
- RTSP (from TopazChat) → FFmpeg → OggOpus → `StreamType.OggOpus` → discord.js → Discord
- `buildFfmpegArgs()` in `bot.ts` constructs FFmpeg arguments based on env vars
- Supports multiple modes: Opus copy (zero transcode), libopus re-encode, AAC fallback
- Channel fix modes: none, swap, left, right, mix (via `-af pan=...`)

### Environment Variables (see .env.example)
- `DISCORD_TOKEN` — Bot token (required)
- `RTSP_SERVER_URL` — Base RTSP URL (default: `rtsp://topaz.chat/live`)
- `USE_EXTERNAL_OPUS` — `1` (default) for OggOpus output, `0` for AAC ADTS fallback
- `INPUT_IS_OPUS` — `1` to use `-c:a copy` (no re-encode) when input is already Opus
- `FORCE_OPUS_REENCODE` — `1` to force libopus re-encode even when INPUT_IS_OPUS=1
- `LOW_LATENCY` — `1` for nobuffer/analyzeduration=0/probesize=32K
- `OPUS_BITRATE` — Target bitrate (default: `192k`)
- `CHANNEL_FIX_MODE` — `none|swap|left|right|mix`
- `DEBUG_FFMPEG` — `1` to log FFmpeg spawn args and stderr

### Per-Guild State
- `GuildAudioState` tracks connection, player, streamKey, streamUrl, ffmpegProcess, isPlaying
- `guildAudioStates` Map keyed by guild ID
- `playStream()` runs an infinite retry loop with auto-resume on stream interruption

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
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier write
npm run format:check # Prettier check
npm run typecheck    # tsc --noEmit
```

## Common Issues

### Voice Gateway v8
`@discordjs/voice` must be >= 0.19.0 to support Discord's Voice Gateway v8. Older versions cause `signalling → connecting → signalling` infinite loop.

### FFmpeg Requirements
FFmpeg must have `libopus` encoder. Verify: `ffmpeg -encoders 2>/dev/null | grep libopus`

### DAVE Encryption
Discord requires DAVE (Discord Audio Video Encryption). `@snazzah/davey` ^0.1.10 provides this.

## Coding Conventions

- Strict TypeScript (`"strict": true`)
- ESLint flat config (`eslint.config.ts`) + Prettier
- No dotenv package — custom .env loader inlined in both `bot.ts` and `index.ts`
- Exported functions and types for testability
- PM2 for production deployment
