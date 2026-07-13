
# TopazBot - RTSP Discord Music bot for TopazChat (FetherBotブランチ)
[![Node.js CI](https://github.com/emerauda/TopazBot/actions/workflows/node.js.yml/badge.svg?branch=FetherBot)](https://github.com/emerauda/TopazBot/actions/workflows/node.js.yml)
[![CircleCI](https://circleci.com/gh/emerauda/TopazBot/tree/FetherBot.svg?style=svg)](https://circleci.com/gh/emerauda/TopazBot/tree/FetherBot)

![49b54ba526ab1540bafd1bea6e593542](https://user-images.githubusercontent.com/35634920/129456355-da650b6d-37e1-4da0-a362-f056eebea238.png)

## コミュニティ
- TopazChat Discord Server

参加はこちら: https://discord.com/invite/fCMcJ8A

## TopazBotについて
TopazChatのRTSPストリームをDiscordのボイスチャンネルに中継するBotで、TypeScriptで書かれています。

このブランチは**レガシーなシングルギルド版**です。`.env` の `STREAM` + `NUMBER` で決まる固定のストリームキーを再生し、指定ボイスチャンネルへの自動参加に対応します。`/play streamkey` 方式のマルチギルド版は [mainブランチ](https://github.com/emerauda/TopazBot/tree/main) にあります。

**注意!!**

*「TopazBot」はMITライセンスで公開されていますが、「TopazChat」は商用利用が禁止されています。*

**TopazBotの特徴:**

- 信頼性と予測しやすい動作を重視した、Discordボイスチャンネルへの音声送受信
- さまざまなオーディオソースに対応できる堅牢なオーディオ処理
- FFmpegによる柔軟なストリーム処理と低遅延チューニング

**TopazChatについて:**

[TopazChat](https://github.com/TopazChat/TopazChat) 
は、高品質・低遅延のRTSPサーバです。個人での利用は無料です。
[TopazChat ダウンロード](https://booth.pm/ja/items/1752066)
TopazChatの費用は、開発者のよしたかさん[@TyounanMOTI](https://github.com/TyounanMOTI)が負担しています。
サーバーの維持費や音声・動画配信のデータ転送料のために
寄付をお願いします！→[FANBOX](https://tyounanmoti.fanbox.cc/)
TopazChatのすべてのスポンサーは、SPONSORS.txtに記載されています。


**リンク集:**
- [Documentation](https://emerauda.github.io/TopazBot)
- [GitHub Discussions](https://github.com/emerauda/TopazBot/discussions)
- [Repository](https://github.com/emerauda/TopazBot)

## 依存関係
さまざまなプラットフォームに対応するため、以下の各カテゴリーから1つずつ依存関係をインストールしてください。
依存関係は、パフォーマンスの観点で推奨される順に記載しています。
いずれかがインストールできない場合は、別の選択肢を試してください。

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


**DAVE暗号化 (npm install):**

- `@snazzah/davey`: ^0.1.12

**Encryption Libraries (npm install):**

- `sodium-native`: ^5.1.0

**Opus Libraries (npm install):**

- `@discordjs/opus`: ^0.10.0

**FFmpeg:**

- [`FFmpeg`](https://ffmpeg.org/)（`apt install ffmpeg` などでサーバーにインストールしてください）

**pm2 (npm install): [オプション]**

- `pm2`

# TopazBotのサンプル

これは [discord.js](https://github.com/discordjs/discord.js) と @discordjs/voice を使ってTopazBotを構築するサンプルです。

エラーからの復帰や再接続処理など、安定した配信システムを作る方法に焦点を当てています。

シンプルなストリーミングMusicBotを作りたい方は、このサンプルを参考にしてみてください。

## 使い方

```bash
# for Debian/Ubuntu
# このブランチをclone
$ git clone -b FetherBot https://github.com/emerauda/TopazBot topazbot

# フォルダに移動して必要なプログラムをインストール
$ cd topazbot
$ npm install

# 設定を書き込む（トークン・ストリームキー・自動参加チャンネル等）
$ cp .env.example .env
$ vi .env

# コマンド登録（play/resync/stop + NUMBER の名前で登録されます）
$ node register.js [guildId]

# ビルドして起動
$ npm run build && npm run start

# pm2でBotを起動
$ npm i pm2 -g
$ pm2 start npm -n TopazBot -- start

# TopazBot導入URL
$ https://discord.com/oauth2/authorize?client_id=<Application_ID>&permissions=105263402240&scope=bot%20applications.commands

# ボイスチャンネルに入った後、設定済みストリーム（STREAM + NUMBER）を再生
$ /play{NUMBER}

# 停止した配信が再開した際に音声を再生
$ /resync{NUMBER}

# ボイスチャンネルからTopazBotを切断
$ /stop{NUMBER}
```

## 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Discordボットトークン |
| `STREAM` | Yes | ストリーム名のプレフィックス。固定ストリームキーは `STREAM` + `NUMBER` |
| `NUMBER` | No | コマンド名の接尾辞（例: `2` → `/play2`）。空なら `/play` |
| `TARGET_VOICE_CHANNEL_ID` | No | ユーザー入室時に自動参加するVCのID（空で無効） |
| `RTSP_SERVER_URL` | No | RTSPベースURL（既定: `rtsp://topaz.chat/live`） |
| `LOW_LATENCY` | No | 低遅延モード。既定で有効（`1`）。`0` で無効化 |

`TARGET_VOICE_CHANNEL_ID` にユーザーが入ると自動参加し、チャンネルが無人になると自動退出します。配信が中断している間は自動で再開を試み、SIGINT/SIGTERM（`pm2 stop`/`pm2 restart` など）では FFmpeg プロセスと接続をすべて後始末してから終了します。

## コード構成
このボットのコードはTopazChat向けに最適化されていますが、`RTSP_SERVER_URL` 環境変数で他のRTSPサーバーにも接続できます。

参考にしたコード: [discordjs-japan/音声を再生する](https://scrapbox.io/discordjs-japan/%E9%9F%B3%E5%A3%B0%E3%82%92%E5%86%8D%E7%94%9F%E3%81%99%E3%82%8B)

[Discord.js Japan user Group](https://scrapbox.io/discordjs-japan/)

## コントリビューション
[コントリビューションガイド](https://github.com/emerauda/TopazBot/blob/main/.github/CONTRIBUTING.md) をご覧ください。

## 寄付

### TopazBot

公開TopazBotサーバーの維持のため、ご支援をお願いしています。

* TopazBot [GitHub Sponsors](https://github.com/sponsors/ROZ-MOFUMOFU-ME?o=sd&sc=t)

### TopazChat

TopazChatのサーバー維持費やデータ転送料をまかなうため、開発者のよしたかさんが寄付を募っています。
 
* TopazChat [FANBOX](https://tyounanmoti.fanbox.cc/)

## クレジット
### TopazBot
 
* Aoi Emerauda [@emerauda](https://github.com/emerauda)

### TopazChat

* よしたか様 [@TyounanMOTI](https://github.com/TyounanMOTI) TopazChat開発者

## ライセンス
MITライセンスで公開されています。詳細は LICENSE ファイルをご覧ください。
