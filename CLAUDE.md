# CLAUDE.md — TopazBot

## Project Overview

TopazChat の RTSP ストリームを Discord ボイスチャンネルに中継する Discord Bot。
FFmpeg で RTSP (AAC) → OggOpus にトランスコードし、`@discordjs/voice` で Discord に送信する。

## Architecture

- **`src/index.ts`** — メインのボットエントリポイント（PM2 でデプロイ）。環境変数 `NUMBER`/`STREAM` でストリームキーを構成。コマンド名は `play{N}`, `resync{N}`, `stop{N}`。
- **`src/bot.ts`** — テスト対応版（jest 用）。汎用的な `/play streamkey` コマンド方式。多数の環境変数で動作をカスタマイズ可能。
- **`register.js`** — Discord スラッシュコマンドの登録スクリプト（レガシー JS）。

## Tech Stack

- TypeScript, Node.js (ES2020 target, CommonJS)
- discord.js v14, @discordjs/voice (Voice Gateway v8, DAVE encryption)
- FFmpeg (libopus), @discordjs/opus, sodium-native

## Build & Run

```bash
npm install
npm run build     # tsc → dist/
npm start         # node dist/index.js
npm run dev       # ts-node src/index.ts
```

## Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token (必須) |
| `NUMBER` | ボット番号 (コマンド名接尾辞、例: `2`) |
| `STREAM` | ストリーム名プレフィックス (例: `maitake`) |
| `TARGET_VOICE_CHANNEL_ID` | 自動参加するVCのID (空欄で無効) |

## Key Design Decisions

- **OggOpus 直接出力**: FFmpeg で AAC→Opus トランスコードし `-f ogg` で出力。`StreamType.OggOpus` で discord.js に渡すことで prism-media の再トランスコードを回避。
- **低遅延フラグ**: FFmpeg に `-fflags nobuffer -flags low_delay` を指定。
- **FFmpeg プロセス管理**: `GuildAudioState.ffmpegProcess` で追跡し、stop/resync 時に確実に kill。
- **自動再接続**: playStream ループで FFmpeg/プレーヤーの異常終了を検知し、10秒待機後に自動リトライ。
- **自動参加/退出**: `voiceStateUpdate` で TARGET_VOICE_CHANNEL_ID を監視。

## Common Issues

- **Voice Gateway バージョン**: Discord は Voice Gateway v8 を要求する。`@discordjs/voice` は `^0.19.2` 以上が必要（0.18.x 以下は v4 で接続失敗する）。
- **FFmpeg の `-c:a copy -f adts` は使用不可**: 入力は AAC だが、Discord は Opus のみ対応。必ず Opus へのトランスコードが必要。
- **`connecting -> signalling` ループ**: @discordjs/voice のバージョンが古い場合に発生。パッケージ更新で解決。
