import { Client, GatewayIntentBits } from 'discord.js';
import { generateDependencyReport } from '@discordjs/voice';
import { readFileSync } from 'fs';
import { handleInteraction } from './bot';

// Inlined test environment check
const isTestEnv = !!process.env.JEST_WORKER_ID;

// Simple .env loader (skipped in test environment)
if (!isTestEnv) {
  try {
    const env = readFileSync('.env', 'utf-8');
    env.split('\n').forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match) {
        const [, key, value] = match;
        if (!process.env[key]) {
          process.env[key] = value.replace(/^['"]|['"]$/g, ''); // remove quotes
        }
      }
    });
  } catch {
    // Do nothing if .env does not exist
  }
}

// Read token from environment variable
const token = process.env.DISCORD_TOKEN;
if (!token && !isTestEnv) {
  throw new Error('DISCORD_TOKEN is not set in environment variables.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Register event handlers
client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}! client ready...`);
});
client.on('interactionCreate', handleInteraction);

// If this script is run directly and not in test environment, output dependency report and login
if (require.main === module && !isTestEnv) {
  console.log(generateDependencyReport());
  if (token) {
    client.login(token);
  }
}

// Export client for testing
export { client };
