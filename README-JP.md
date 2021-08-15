
# TopazBot - RTSP Discord Music bot for TopazChat

![49b54ba526ab1540bafd1bea6e593542](https://user-images.githubusercontent.com/35634920/129456355-da650b6d-37e1-4da0-a362-f056eebea238.png)

## コミュニティ
- TopazChat Discord

join: https://discord.com/invite/fCMcJ8A

## TopazBotについて
Node.js用のDiscord Voice APIのTopazChat RTSP専用の実装で、Javacriptで書かれています。

**注意!!**

*「TopazBot」はMITライセンス下にありますが、「TopazChat」は商用利用禁止です*

**TopazBotの特徴:**

Discordの音声チャンネルでオーディオを送受信する信頼性と予測可能な動作に重点を置いています。
水平方向の拡張性、discord.js以外のライブラリもカスタムアダプタでサポートします。
様々なオーディオソースに対応可能な安定したなオーディオ処理システムです。

**TopazChaについてt:**

[TopazChat](https://booth.pm/ja/items/1752066)
は、高品質・低遅延のRTSPサーバです。個人での利用は無料です。
TopazChatの費用は、開発者のよしたかさん[@TyounanMOTI](https://github.com/TyounanMOTI)が負担しています。
サーバーの維持費や音声・動画配信のデータ転送料のために
寄付をお願いします！[FANBOX](https://tyounanmoti.fanbox.cc/)
TopazChatのすべてのスポンサーは、SPONSORS.txtに記載されています。


**リンク集:**
- [TopazChat](https://booth.pm/ja/items/1752066)
- [Documentation](https://discordjs.github.io/voice)
- [Examples](https://github.com/discordjs/voice/tree/main/examples)
- [GitHub Discussions](https://github.com/discordjs/voice/discussions)
- [Discord.js Server](https://discord.gg/djs)
- [Repository](https://github.com/discordjs/voice)

## 依存関係
このライブラリは、さまざまなプラットフォームをサポートするために、いくつかのオプションの依存関係があります。
いくつかのオプションの依存関係があります。以下のカテゴリーからそれぞれ1つずつインストールしてください。
インストールしてください。依存関係は、パフォーマンスが優先される順に記載されています。
依存関係は、パフォーマンスの優先順位が高い順に記載されています。オプションの1つがインストールできない場合は、別のオプションをインストールしてみてください。
別のものをインストールしてみてください。

### Debian or Ubuntu

**node & npm:**

- `node`: >=14
- `npm`: >=6

**discord.js:**

- `discord.js`: ^13.0.0

**@discordjs/voice:**

- `@discordjs/voice`: ^0.6.0

**Encryption Libraries (npm install):**

- `sodium`: ^3.0.2

**Opus Libraries (npm install):**

- `@discordjs/opus`: ^0.5.3

**FFmpeg:**

- [`FFmpeg`](https://ffmpeg.org/) (サーバーにインストールして下さい)
- `ffmpeg-static`: ^4.2.7 (npm install)

**dotenv (npm install):**

- `dotenv`: ^10.0.0

**pm2 (npm install): [オプション]**

- `pm2`

# TopazBotの例

これは@discordjs/voiceを使って、[discord.js](https://github.com/discordjs/discord.js)と一緒にTopazBotを作成する例です。

この例では、このライブラリを使用して安定したな配信システムを作成する方法に焦点を当てています。

シンプルなストリーミングMusicBotを作りたいと思っている方は、このサンプルを参考にしてみてください。

## 使い方

```bash
# mainリポジトリからclone
$ git clone https://github.com/ROZ-MOFUMOFU-ME/TopazBot topazbot

# フォルダに移動して必要なプログラムをインストール
$ cd topazbot
$ npm install

# トークンを書き込む (example.envを見てね)
$ vi .env

# コマンド登録
$ node register.js

# プログラムスタート
$ npm start

# pm2を使ってプログラムスタート
$ sudo npm i pm2 -g
$ pm2 start index.js --name TopazBot

# TopazBot導入URL
$ https://discord.com/oauth2/authorize?client_id=<Application_ID>&permissions=105263402240&scope=bot%20applications.commands

# Discordで再生
$ /play StreamKey
```

## Code structure
このボットのコードはTopazChat専用です。

私が参考にしたコード [Discord.js Japan user Group](https://scrapbox.io/discordjs-japan/]

[discordjs-japan/音声を再生する](https://scrapbox.io/discordjs-japan/%E9%9F%B3%E5%A3%B0%E3%82%92%E5%86%8D%E7%94%9F%E3%81%99%E3%82%8B)

## コントリビューション
こちらをご覧下さい [Contributing Guide](https://github.com/ROZ-MOFUMOFU-ME/topazbot/blob/main/.github/CONTRIBUTING.md).

## 寄付
TopazChatのサーバー維持費やデータ転送料を、開発者のよしたかさんがカンパを募っています。
 
* TopazChat [FANBOX](https://tyounanmoti.fanbox.cc/)

## クレジット
### TopazBot
 
* Aoi Emerauda [@ROZ-MOFUMOFU-ME](https://github.com/ROZ-MOFUMOFU-ME)

### TopazChat

* Hirotoshi Yoshitaka [@TyounanMOTI](https://github.com/TyounanMOTI)

## ライセンス
MITライセンスでリリースされています。LICENSEファイルをご覧ください。