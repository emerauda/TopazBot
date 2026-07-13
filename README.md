# ![logo](docs/icon/32x32.png) TopazBot - RTSP Discord Music bot for TopazChat

[![Lint/Format](https://github.com/emerauda/TopazBot/actions/workflows/lint.yml/badge.svg)](https://github.com/emerauda/TopazBot/actions/workflows/lint.yml)
[![Node.js CI](https://github.com/emerauda/TopazBot/actions/workflows/node.js.yml/badge.svg)](https://github.com/emerauda/TopazBot/actions/workflows/node.js.yml)
[![CircleCI](https://circleci.com/gh/emerauda/TopazBot/tree/main.svg?style=svg)](https://circleci.com/gh/emerauda/TopazBot/tree/main)
[![codecov](https://codecov.io/gh/emerauda/TopazBot/graph/badge.svg?token=PSJ1EUT6QO)](https://codecov.io/gh/emerauda/TopazBot)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![Discord](https://img.shields.io/badge/Discord-Bot-5865F2?style=flat&logo=discord&logoColor=white)](https://discord.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![Screenshot](docs/assets/screenshot.png)

[Japanese README (日本語)](./README-JP.md)

---

## 🌟 Overview

**TopazBot** is a high-quality, low-latency Discord music bot that utilizes TopazChat's RTSP stream. It runs on servers like Linux and provides streamed audio to your Discord server.

**Attention!!**

_"TopazBot" is under the MIT license, but "TopazChat" is not for commercial use._

### ✨ Key Features

- 🧠 **High Quality**: Stereo, high-fidelity, low-latency stream playback.
- 🔒 **Secure**: End-to-end encrypted voice with DAVE (Discord Audio Video Encryption).
- 🌐 **Multi-format Support**: Flexible stream processing with ffmpeg.

---

## 💎 About TopazChat

### 📝 Details

[TopazChat](https://github.com/TopazChat/TopazChat) is a high-quality, low-latency RTSP server. It is free for personal use.

[TopazChat Download](https://booth.pm/ja/items/1752066)

The costs for TopazChat are covered by the developer, Hirotoshi Yoshitaka [@TyounanMOTI](https://github.com/TyounanMOTI).

Please consider donating to help with server maintenance and data transfer costs for audio/video streaming! → [FANBOX](https://tyounanmoti.fanbox.cc/)

All sponsors of TopazChat are listed in SPONSORS.txt.

### 💬 Community

- TopazChat Discord Server

Join: https://discord.com/invite/fCMcJ8A

---

## 🚀 Quick Start

There are two ways to get started with TopazBot.

### 1. Use the Public Bot

This is the easiest way. You can add the bot to your Discord server using the link below:

[Click here to add the bot](https://discord.com/oauth2/authorize?client_id=876143776572248074)

### 2. Self-Hosting

You can host the bot on your own server.

#### 📋 Prerequisites

- Linux Server
- FFmpeg (RTSP-enabled)
- Node.js 22.x
- npm or yarn
- Discord Bot Token
- TopazChat Stream

#### 📦 Dependencies

This library requires one dependency from each of the categories below to support various platforms.

The dependencies are listed in order of performance preference.

If you cannot install one of the options, try installing another.

##### 🐧 Debian or Ubuntu

**node & npm:**

- `node`: >=22
- `npm`: >=10

**discord.js (npm install)**

- `discord.js`: ^14.26.5

**@discordjs/voice (npm install):**

- `@discordjs/voice`: ^0.19.2

**@discordjs/opus (npm install):**

- `@discordjs/opus`: "^0.10.0"

**DAVE Encryption (npm install):**

- `@snazzah/davey`: ^0.1.12

**Encryption Libraries (npm install):**

- `sodium-native`: ^5.1.0

**Opus Libraries (npm install):**

- `@discordjs/opus`: ^0.10.0

**FFmpeg:**

- [`FFmpeg`](https://ffmpeg.org/) (Please install on your server, e.g., `apt install ffmpeg`)

**pm2 (npm install): [Optional]**

- `pm2`

#### 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/emerauda/TopazBot.git topazbot
cd topazbot

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit the .env file and set the required environment variables
```

#### ⚙️ Configuration

Set the following environment variables in your `.env` file:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token

# RTSP Server Configuration (optional)
# Default: rtsp://topaz.chat/live
RTSP_SERVER_URL=rtsp://topaz.chat/live
```

**Configuration Options:**

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | Yes | - | Discord bot token |
| `RTSP_SERVER_URL` | No | `rtsp://topaz.chat/live` | RTSP server base URL |
| `USE_EXTERNAL_OPUS` | No | `1` | `1` = OggOpus output (recommended), `0` = AAC ADTS fallback |
| `INPUT_IS_OPUS` | No | `0` | `1` = copy-remux only if the source really delivers Opus (TopazChat is AAC → keep `0`; auto-fallback on mismatch) |
| `FORCE_OPUS_REENCODE` | No | `0` | `1` = force libopus re-encode even when `INPUT_IS_OPUS=1` |
| `LOW_LATENCY` | No | `0` | `1` = enable low-latency FFmpeg flags (nobuffer, analyzeduration=0) |
| `OPUS_BITRATE` | No | `192k` | Target Opus bitrate |
| `AAC_BITRATE` | No | `OPUS_BITRATE` | Bitrate for the AAC fallback (`USE_EXTERNAL_OPUS=0`) |
| `CHANNEL_FIX_MODE` | No | `none` | `none` / `swap` / `left` / `right` / `mix` (re-encode path only) |
| `DOWNMIX_MONO` | No | `0` | `1` = downmix input to mono (`-ac 1`, re-encode path only) |
| `COPY_WITH_DISCARDCORRUPT` | No | `0` | `1` = discard corrupt frames / regenerate PTS in copy mode too |
| `PLAY_WAIT_MS` | No | `2000` / `300` | Stabilization wait after playback starts (low-latency default: 300) |
| `RESUME_WAIT_MS` | No | `3000` / `500` | Wait before an auto-resume retry (low-latency default: 500) |
| `DEBUG_FFMPEG` | No | `0` | `1` = log FFmpeg spawn args and stderr |

When using the bot, streams will be accessed as `${RTSP_SERVER_URL}/${streamkey}`.

#### 🚀 Deployment

```bash
# Build
npm run build

# Start
npm run start

# Register commands
npm run register

# Start the program using pm2
npm i pm2 -g
pm2 start npm -n TopazBot -- start
```

---

## 🎮 Command List

TopazBot supports the following slash commands.

### ▶️ `/play`

- **Description**: Plays the RTSP stream from TopazChat using the specified stream key.
- **Usage**: `/play StreamKey: <your_stream_key>`
- **Parameters**:
  - `StreamKey` (required): Your TopazChat stream key.

### 🔄 `/resync`

- **Description**: Attempts to reconnect if the connection is unstable or the stream is interrupted.
- **Usage**: `/resync` or `/resync StreamKey: <your_stream_key>`
- **Parameters**:
  - `StreamKey` (optional): Stream key to resync. Defaults to the last played one.

### ⏹️ `/stop`

- **Description**: Stops the current stream playback and disconnects from the voice channel.
- **Usage**: `/stop`

### 🎚️ Playback Behavior

- **Auto-resume**: If the stream is interrupted (e.g. the streamer restarts), the bot keeps the connection and resumes playback automatically when the stream comes back.
- **Auto-disconnect**: If no playback succeeds for 30 minutes (e.g. the streamer never comes back), the bot leaves the voice channel automatically. Healthy long-running streams are never cut off.
- **Stream switching**: Running `/play` with a different stream key while playing switches to the new stream.
- **Failure handling**: If the first playback attempt fails, the bot reports the error and leaves the voice channel.
- **Graceful shutdown**: On SIGINT/SIGTERM (e.g. `pm2 stop`/`pm2 restart`), all sessions are cleaned up — no orphan FFmpeg processes or voice connections are left behind.

---

## 📜 Legal

- **[Terms of Service](https://emerauda.github.io/TopazBot/terms/)**
- **[Privacy Policy](https://emerauda.github.io/TopazBot/privacy/)**

---

## 🏗️ Architecture

```mermaid
graph TD
    subgraph "Discord Server"
        User
        DiscordVoiceChannel[Discord Voice Channel]
    end

    subgraph "Your Server (VPS)"
        TopazBot
        FFmpeg
    end

    subgraph "TopazChat Server"
        TopazChat
    end

    User -- "/play" --> TopazBot
    TopazBot -- "RTSP Stream Request" --> TopazChat
    TopazChat -- "RTSP Stream" --> FFmpeg
    FFmpeg -- "Opus Audio" --> TopazBot
    TopazBot -- "Sends Audio" --> DiscordVoiceChannel
```

### 🔧 Tech Stack

| Category             | Technology       | Version  |
| :------------------- | :--------------- | :------- |
| **Language**         | TypeScript       | ^6.0.3   |
| **Runtime**          | Node.js          | >=22.x   |
| **Framework**        | discord.js       | ^14.26.5 |
| **Audio Processing** | @discordjs/voice | ^0.19.2  |
| **DAVE Encryption**  | @snazzah/davey   | ^0.1.12  |
| **Media Processing** | FFmpeg           | -        |
| **RTSP Server**      | TopazChat        | -        |
| **Opus Library**     | @discordjs/opus  | ^0.10.0  |
| **Encryption**       | sodium-native    | ^5.1.0   |
| **Package Manager**  | npm              | >=10     |
| **Testing**          | Jest             | ^30.4.2  |
| **Linter**           | ESLint           | ^10.7.0  |
| **Formatter**        | Prettier         | ^3.9.5   |

---

## 🧪 Development

### 📝 Scripts

| Command                 | Description                     |
| ----------------------- | ------------------------------- |
| `npm run build`         | Build TypeScript                |
| `npm run start`         | Build and start the bot         |
| `npm run dev`           | Start with ts-node (dev)        |
| `npm run register`      | Register Discord slash commands |
| `npm run lint`          | Run ESLint                      |
| `npm run lint:fix`      | Run ESLint with auto-fix        |
| `npm run format`        | Apply Prettier formatting       |
| `npm run format:check`  | Check Prettier formatting       |
| `npm run typecheck`     | Type-check without emitting     |
| `npm run test`          | Run tests                       |
| `npm run test:watch`    | Run tests in watch mode         |
| `npm run test:coverage` | Run tests with coverage         |

### 🔍 Debugging

```bash
# Start local development server
npm run dev

# Run tests
npm test

# Generate coverage report
npm run test:coverage
```

#### The coverage report can be viewed on [Codecov](https://codecov.io/gh/emerauda/TopazBot)

---

## 📂 Code structure

The code for this bot is optimized for TopazChat, but it also works with other RTSP servers via the `RTSP_SERVER_URL` environment variable.

Here is the code I used for reference: [discordjs-japan/Playing Audio](https://scrapbox.io/discordjs-japan/%E9%9F%B3%E5%A3%B0%E3%82%92%E5%86%8D%E7%94%9F%E3%81%99%E3%82%8B) (in Japanese)

Created by [Discord.js Japan user Group](https://scrapbox.io/discordjs-japan/)

---

## 🤝 Contributing to TopazBot

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

Please read our [Contributing Guidelines](https://github.com/emerauda/TopazBot/blob/main/.github/CONTRIBUTING.md) for more details on the process and what we expect.

---

## ❤️ Donations

### 📻 TopazBot

Please consider donating to help maintain the public TopazBot server.

- TopazBot [GitHub Sponsors](https://github.com/sponsors/ROZ-MOFUMOFU-ME?o=sd&sc=t)

### 💎 TopazChat

The developer of TopazChat, Hirotoshi Yoshitaka, is seeking donations to cover server maintenance and data transfer costs.

- TopazChat [FANBOX](https://tyounanmoti.fanbox.cc/)

## 🙏 Credits

### 📻 TopazBot

- Aoi Emerauda [@emerauda](https://github.com/emerauda)

### 💎 TopazChat

- Hirotoshi Yoshitaka [@TyounanMOTI](https://github.com/TyounanMOTI) TopazChat Developer

## 📄 License

This project is released under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## 👥 Team

<div align="center" markdown="1">

[![Contributors](https://contrib.rocks/image?repo=emerauda/TopazBot)](https://github.com/emerauda/TopazBot/graphs/contributors)

</div>

---

## 📞 Support

- 🐛 **Bug Reports**: [Issues](https://github.com/emerauda/TopazBot/issues)
- 💡 **Feature Requests**: [Discussions](https://github.com/emerauda/TopazBot/discussions)
- 📧 **Contact**: [aoi@emerauda.com](mailto:aoi@emerauda.com)

---

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=emerauda/TopazBot&type=Date&theme=dark)](https://star-history.com/#emerauda/TopazBot&Date)

---

## 📊 Statistics

![GitHub Stats](https://github-readme-stats.vercel.app/api?username=emerauda&repo=TopazBot&show_icons=true&theme=dark)

---

<div align="center" markdown="1">

**⭐ If you like this project, please give it a star! ⭐**

[![GitHub stars](https://img.shields.io/github/stars/emerauda/TopazBot.svg?style=social&label=Star)](https://github.com/emerauda/TopazBot)
[![GitHub forks](https://img.shields.io/github/forks/emerauda/TopazBot.svg?style=social&label=Fork)](https://github.com/emerauda/TopazBot/fork)
[![GitHub watchers](https://img.shields.io/github/watchers/emerauda/TopazBot.svg?style=social&label=Watch)](https://github.com/emerauda/TopazBot)

Made with ❤️ by [Aoi Emerauda](https://github.com/emerauda)

</div>
