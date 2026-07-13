import { Client, GatewayIntentBits, Interaction } from 'discord.js';
import { handleInteraction, shutdownAllGuilds } from './bot';
import { loadEnvFile } from './env';

// Detect test environment
const isTestEnv = !!process.env.JEST_WORKER_ID;

// .env loader (skipped in test environment, never overrides existing variables)
loadEnvFile();

// Lazy singleton client export (tests expect `client` named export)
export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Register basic events (tests check these listeners exist)
// 'clientReady' replaces the deprecated 'ready' event (discord.js v14.22+ / v15)
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

  // Graceful shutdown (PM2 sends SIGINT on stop/restart): stop all guild
  // sessions so no ffmpeg processes or voice connections are left behind.
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`Received ${signal}, shutting down...`);
    shutdownAllGuilds();
    void client.destroy().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

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
