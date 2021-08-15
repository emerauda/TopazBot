![49b54ba526ab1540bafd1bea6e593542](https://user-images.githubusercontent.com/35634920/129456355-da650b6d-37e1-4da0-a362-f056eebea238.png)
# TopazBot

<p>
https://github.com/ROZ-MOFUMOFU-ME/TopazBot
</p>

## About

A TopazChat RTSP specific implementation of the Discord Voice API for Node.js, written in Javacript.

**Features:**

Send and receive* audio in Discord voice-based channels
A strong focus on reliability and predictable behaviour
Horizontal scalability and libraries other than discord.js are supported with custom adapters
A robust audio processing system that can handle a wide range of audio sources

**About TopazChat:**

[TopazChat](https://booth.pm/ja/items/1752066)
is a high quality, low latency RTSP server. It is free for personal use.
TopazChat's costs is paid by the author [@TyounanMOTI](https://github.com/TyounanMOTI), 
to maintain the instance and audio and video stream data transfer.
Please make a donation! at [FANBOX](https://tyounanmoti.fanbox.cc/).
All sponsors of TopazChat are listed in the SPONSORS.txt.


**Useful links:**
- [TopazChat](https://booth.pm/ja/items/1752066)
- [Documentation](https://discordjs.github.io/voice)
- [Examples](https://github.com/discordjs/voice/tree/main/examples)
- [GitHub Discussions](https://github.com/discordjs/voice/discussions)
- [Discord.js Server](https://discord.gg/djs)
- [Repository](https://github.com/discordjs/voice)

## Dependencies

This library has several optional dependencies to support a variety
of different platforms. Install one dependency from each of the
categories shown below. The dependencies are listed in order of
preference for performance. If you can't install one of the options,
try installing another.

for Debian or Ubuntu...

**node & npm:**

- `node`: >>14.0.0

**discord.js:**

- `discord.js`: ^13.0.0

**@discordjs/voice:**

- `@discordjs/voice`: ^0.6.0

**Encryption Libraries (npm install):**

- `sodium`: ^3.0.2

**Opus Libraries (npm install):**

- `@discordjs/opus`: ^0.5.3

**FFmpeg:**

- [`FFmpeg`](https://ffmpeg.org/) (installed and added to environment)
- `ffmpeg-static`: ^4.2.7 (npm install)

**dotenv (npm install):**

- `dotenv`: ^10.0.0

# TopazBot Example

This is an example of how to create a music bot using @discordjs/voice alongside [discord.js](https://github.com/discordjs/discord.js).

The focus of this example is on how to create a robust music system using this library. The example explores error recovery, reconnection logic and implementation of a queue that won't lock up.

If you're looking to make your own music bot that is fairly simple, this example is a great place to start.

## Usage

```bash
# Clone the main repository
$ git clone https://github.com/ROZ-MOFUMOFU-ME/TopazBot topazbot

# Open this example and install dependencies
$ cd topazbot
$ npm install

# Set a bot token (see example.env)
$ vi .env

# Regist command
$ node register.js

# Start the bot
$ npm start

# Start the bot with pm2
$ pm2 start index.js --name TopazBot

# Summon TopazBot to Discord Server
$ https://discord.com/oauth2/authorize?client_id=<Application_ID>&permissions=105263402240&scope=bot%20applications.commands

# Play music at Discord
$ /play StreamKey
```

## Code structure

The code for the bot is specific to TopazChat.

Here is the code I used for reference
https://scrapbox.io/discordjs-japan/%E9%9F%B3%E5%A3%B0%E3%82%92%E5%86%8D%E7%94%9F%E3%81%99%E3%82%8B

## Contribution

See [Contributing Guide](https://github.com/ROZ-MOFUMOFU-ME/topazbot/blob/main/.github/CONTRIBUTING.md).
