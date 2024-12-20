﻿
# TopazBot - RTSP Discord Music bot for TopazChat
[![Join the chat at https://github.com/ROZ-MOFUMOFU-ME/TopazBot/](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/ROZ-MOFUMOFU-ME/TopazBot?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![Node.js CI](https://github.com/ROZ-MOFUMOFU-ME/TopazBot/actions/workflows/node.js.yml/badge.svg)](https://github.com/ROZ-MOFUMOFU-ME/TopazBot/actions/workflows/node.js.yml)
[![CircleCI](https://circleci.com/gh/ROZ-MOFUMOFU-ME/TopazBot/tree/main.svg?style=svg)](https://circleci.com/gh/ROZ-MOFUMOFU-ME/TopazBot/tree/main)

![スクリーンショット 2023年-05月-13日 21 36 27](https://github.com/ROZ-MOFUMOFU-ME/TopazBot/assets/35634920/d95514b6-7993-4a35-ba02-c0f5736eb20a)

[日本語README](./README-JP.md)

## Community
- TopazChat Discord Server

join: https://discord.com/invite/fCMcJ8A

## About
A TopazChat RTSP specific implementation of the Discord Voice API for Node.js, written in JavaScript.

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
- [Documentation](https://roz-mofumofu-me.github.io/TopazBot)
- [GitHub Discussions](https://github.com/ROZ-MOFUMOFU-ME/TopazBot/discussions)
- [Repository](https://github.com/ROZ-MOFUMOFU-ME/TopazBot)

## Dependencies
This library has several optional dependencies to support a variety
of different platforms. Install one dependency from each of the
categories shown below. The dependencies are listed in order of
preference for performance. If you can't install one of the options,
try installing another.

### Debian or Ubuntu

**node & npm:**

- `node`: >=16
- `npm`: >=6

**discord.js:**

- `discord.js`: ^13.0.0

**@discordjs/voice:**

- `@discordjs/voice`: ^0.6.0

**Encryption Libraries (npm install):**

- `sodium`: ^3.0.2

**Opus Libraries (npm install):**

- `@discordjs/opus`: ^0.6.0

**FFmpeg:**

- [`FFmpeg`](https://ffmpeg.org/) (installed and added to environment)
- `ffmpeg-static`: ^4.2.7 (npm install)

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
# Clone the main repository
$ git clone https://github.com/ROZ-MOFUMOFU-ME/TopazBot topazbot

# Open this example and install dependencies
$ cd topazbot
$ npm install

# Set a bot token
$ vi config.json

# Regist command
$ node register.js

# Start the bot
$ npm start

# Start the bot with pm2
$ sudo npm i pm2 -g
$ pm2 start index.js --name TopazBot

# Summon TopazBot to your Discord Server
$ https://discord.com/api/oauth2/authorize?client_id=876143776572248074&permissions=3155968&scope=bot%20applications.commands

# Play music after join voice channel at Discord text field
$ /play StreamKey

# Resume stopped music when stream is restart
$ /resync

# Disconnect TopazBot from the voice channel
$ /stop
```

## Code structure
The code for the bot is specific to TopazChat.

Here is the code I used for reference. [@discordjs/voiceを使用して音声を再生する](https://scrapbox.io/discordjs-japan/%E9%9F%B3%E5%A3%B0%E3%82%92%E5%86%8D%E7%94%9F%E3%81%99%E3%82%8B)

Created by [Discord.js Japan user Group](https://scrapbox.io/discordjs-japan/)

## Contribution
See [Contributing Guide](https://github.com/ROZ-MOFUMOFU-ME/topazbot/blob/main/.github/CONTRIBUTING.md).

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
 
* Aoi Emerauda [@ROZ-MOFUMOFU-ME](https://github.com/ROZ-MOFUMOFU-ME)

### TopazChat

* Hirotoshi Yoshitaka [@TyounanMOTI](https://github.com/TyounanMOTI) Auther

## License
Released under the MIT License. See LICENSE file.
