import { Client, GatewayIntentBits, Interaction } from 'discord.js';
import { readFileSync } from 'fs';
import { handleInteraction } from './bot';

// Detect test environment
const isTestEnv = !!process.env.JEST_WORKER_ID;

// Lazy singleton client export (tests expect `client` named export)
export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// .env loader (simple, tolerant)
(function loadEnv() {
  if (isTestEnv) return; // skip in test env for predictable tests
  try {
    const env = readFileSync('.env', 'utf-8');
    env.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = line.match(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*.*/);
      if (!match) return;
      const eqIdx = line.indexOf('=');
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();
      value = value.replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = value; // don't override existing
    });
  } catch {
    // Ignore missing .env
  }
})();

// Register basic events (tests check these listeners exist)
// v15 'clientReady' イベント
client.once('clientReady', () => {
  if (!isTestEnv) console.log('Bot ready');
});

client.on('interactionCreate', async (interaction: Interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (e) {
    if (!isTestEnv) console.error('interaction error', e);
  }
});

// Only login when executed directly and not in test env
if (require.main === module && !isTestEnv) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error('DISCORD_TOKEN is not set');
  }
  client
    .login(token)
    .then(() => {
      console.log('Logged in');
    })
    .catch((err) => {
      console.error('Login failed', err);
      process.exit(1);
    });
}
