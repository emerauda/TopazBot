import { Client, GatewayIntentBits } from 'discord.js';
import { generateDependencyReport } from '@discordjs/voice';
import { readFileSync } from 'fs';
import { handleInteraction } from './bot';

// Simple .env loader (no external dependencies), skip in Jest tests
if (!process.env.JEST_WORKER_ID) {
  try {
    const env = readFileSync('.env', 'utf-8');
    env.split('\n').forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match) {
        const [, key, value] = match;
        if (!process.env[key]) {
          process.env[key] = value.replace(/^['\"]|['\"]$/g, ''); // remove quotes
        }
      }
    });
  } catch {
    // Do nothing if .env does not exist
  }
}

// Read token from environment variable
const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error('DISCORD_TOKEN is not set in environment variables.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
console.log(generateDependencyReport());

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}! client ready...`);
});

// Unified command handler
client.on('interactionCreate', handleInteraction);

// client.loginは本番環境のみ (Jestではスキップ)
if (!process.env.JEST_WORKER_ID) {
  client.login(token);
}
// テスト用にクライアントをエクスポート
export { client };
