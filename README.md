
# TopazBot - RTSP Discord Music bot for TopazChat (FetherBot branch)
[![Node.js CI](https://github.com/emerauda/TopazBot/actions/workflows/node.js.yml/badge.svg?branch=FetherBot)](https://github.com/emerauda/TopazBot/actions/workflows/node.js.yml)
[![CircleCI](https://circleci.com/gh/emerauda/TopazBot/tree/FetherBot.svg?style=svg)](https://circleci.com/gh/emerauda/TopazBot/tree/FetherBot)

![スクリーンショット 2023年-05月-13日 21 36 27](https://github.com/emerauda/TopazBot/assets/35634920/d95514b6-7993-4a35-ba02-c0f5736eb20a)

[日本語README](./README-JP.md)

## Community
- TopazChat Discord Server

join: https://discord.com/invite/fCMcJ8A

## About
A TopazChat RTSP relay bot for Discord voice channels, written in TypeScript.

This branch is the **legacy single-guild version**: it plays one fixed stream
key (`STREAM` + `NUMBER` from `.env`) and can auto-join a designated voice
channel. The multi-guild version with a `/play streamkey` option lives on the
[main branch](https://github.com/emerauda/TopazBot/tree/main).

**Attention!!**

*TopazBot is under the MIT license, but TopazChat is not for commercial use.*

**Features:**

Send and receive* audio in Discord voice-based channels
A strong focus on reliability and predictable behaviour
Horizontal scalability and libraries other than discord.js are supported with custom adapters
A robust audio processing system that can handle a wide range of audio sources

**About TopazChat:**

[TopazChat](https://github.com/TopazChat/TopazChat) 
is a high quality, low latency RTSP server. It is free for personal use.
[TopazChat Download](https://booth.pm/ja/items/1752066)
TopazChat's costs is paid by the author Hirotoshi Yoshitaka [@TyounanMOTI](https://github.com/TyounanMOTI), 
to maintain the instance and audio and video stream data transfer.
Please make a donation at [FANBOX](https://tyounanmoti.fanbox.cc/)!.
All sponsors of TopazChat are listed in the SPONSORS.txt.


**Useful links:**
- [Documentation](https://emerauda.github.io/TopazBot)
- [GitHub Discussions](https://github.com/emerauda/TopazBot/discussions)
- [Repository](https://github.com/emerauda/TopazBot)

## Dependencies
This library has several optional dependencies to support a variety
of different platforms. Install one dependency from each of the
categories shown below. The dependencies are listed in order of
preference for performance. If you can't install one of the options,
try installing another.

### Debian or Ubuntu

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

- [`FFmpeg`](https://ffmpeg.org/) (installed and added to environment)

**pm2 (npm install): [Optional]**

- `pm2`

# TopazBot Example

This is an example of how to create a TopazBot using @discordjs/voice alongside [discord.js](https://github.com/discordjs/discord.js).

The focus of this example is on how to create a robust music system using this library. 

The example explores error recovery, reconnection logic and implementation of a queue that won't lock up.

If you're looking to make your own TopazBot that is fairly simple, this example is a great place to start.

## Usage

```bash
# for Debian/Ubuntu
# Clone the repository and switch to this branch
$ git clone -b FetherBot https://github.com/emerauda/TopazBot topazbot

# Open this example and install dependencies
$ cd topazbot
$ npm install

# Configure the bot (token, stream key, optional auto-join channel)
$ cp .env.example .env
$ vi .env

# Register the slash commands (named play/resync/stop + NUMBER)
$ node register.js [guildId]

# Build and start the bot
$ npm run build && npm run start

# Start the bot with pm2
$ npm i pm2 -g
$ pm2 start npm -n TopazBot -- start

# Summon TopazBot to your Discord Server
$ https://discord.com/api/oauth2/authorize?client_id=876143776572248074&permissions=3155968&scope=bot%20applications.commands

# Play the configured stream (STREAM + NUMBER) after joining a voice channel
$ /play{NUMBER}

# Resume stopped music when the stream restarts
$ /resync{NUMBER}

# Disconnect TopazBot from the voice channel
$ /stop{NUMBER}
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `STREAM` | Yes | Stream name prefix; the fixed stream key is `STREAM` + `NUMBER` |
| `NUMBER` | No | Command-name suffix (e.g. `2` → `/play2`); empty for `/play` |
| `TARGET_VOICE_CHANNEL_ID` | No | Voice channel to auto-join when a user enters (empty disables) |
| `RTSP_SERVER_URL` | No | RTSP base URL (default: `rtsp://topaz.chat/live`) |

The bot auto-joins `TARGET_VOICE_CHANNEL_ID` when a user enters it and leaves
automatically when the channel becomes empty. Playback auto-resumes while the
stream is interrupted, and the bot cleans up all FFmpeg processes and voice
connections on shutdown (SIGINT/SIGTERM, e.g. `pm2 stop`/`pm2 restart`).

## Code structure
The code for this bot is optimized for TopazChat, but it also works with other
RTSP servers via the `RTSP_SERVER_URL` environment variable.

Here is the code I used for reference. [@discordjs/voiceを使用して音声を再生する](https://scrapbox.io/discordjs-japan/%E9%9F%B3%E5%A3%B0%E3%82%92%E5%86%8D%E7%94%9F%E3%81%99%E3%82%8B)

Created by [Discord.js Japan user Group](https://scrapbox.io/discordjs-japan/)

## Contribution
See [Contributing Guide](https://github.com/emerauda/topazbot/blob/main/.github/CONTRIBUTING.md).

## Donations

Donations for development are greatly appreciated!

### TopazBot

Please make a donation to help maintain the public TopazBot server.

* TopazBot [GitHub Sponsors](https://github.com/sponsors/ROZ-MOFUMOFU-ME?o=sd&sc=t)

### TopazChat

TopazChat's author Hirotoshi Yoshitaka is asking for donations to cover the costs of maintaining the server and transferring data.
 
* TopazChat [FANBOX](https://tyounanmoti.fanbox.cc/)

## Credits

### TopazBot
 
* Aoi Emerauda [@emerauda](https://github.com/emerauda)

### TopazChat

* Hirotoshi Yoshitaka [@TyounanMOTI](https://github.com/TyounanMOTI) Auther

## License
Released under the MIT License. See LICENSE file.
