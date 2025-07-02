// Command registration script for Discord bot (TypeScript)
// ESLint/Prettier rules applied
import {
  Client,
  ApplicationCommandData,
  Snowflake,
  Collection,
  GatewayIntentBits,
} from 'discord.js';
import { readFileSync } from 'fs';

// Inlined test environment check
const isTestEnv = !!process.env.JEST_WORKER_ID;

// .env loader (skipped in test environment)
if (!isTestEnv) {
  try {
    const env = readFileSync('.env', 'utf-8');
    env.split('\n').forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-ZaZ0-9_]*)\s*=\s*(.*)\s*$/);
      if (match) {
        const [, key, value] = match;
        if (!process.env[key]) {
          process.env[key] = value.replace(/^['\"]|['\"]$/g, '');
        }
      }
    });
  } catch {
    // Do nothing
  }
}

// Read token from environment variable; skip validation in test environment
const token = process.env.DISCORD_TOKEN;

// Throw error if DISCORD_TOKEN is not set when script is executed directly
if (require.main === module && !token) {
  throw new Error('DISCORD_TOKEN is not set in environment variables.');
}

async function register(
  client: Client,
  commands: ApplicationCommandData[],
  guildID?: Snowflake
): Promise<Collection<string, any>> {
  if (!client.application) throw new Error('Client application is not ready.');
  if (!guildID) {
    return client.application.commands.set(commands);
  }
  const guild = await client.guilds.fetch(guildID);
  return guild.commands.set(commands);
}

const playCommand: ApplicationCommandData = {
  name: 'play',
  description: 'Play TopazChat music',
  options: [
    {
      name: 'streamkey',
      type: 3, // STRING
      description: 'The StreamKey of the music to play',
      required: true,
    },
  ],
};
const resyncCommand: ApplicationCommandData = {
  name: 'resync',
  description: 'Resync TopazChat music',
};
const stopCommand: ApplicationCommandData = {
  name: 'stop',
  description: 'Stop TopazChat music',
};
const commands: ApplicationCommandData[] = [playCommand, resyncCommand, stopCommand];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function main() {
  await client.login(token);
  if (!client.application) throw new Error('Client application is not ready after login.');
  await client.application.fetch();
  await register(client, commands, process.argv[2]);
  console.log('registration succeed!');
  process.exit(0);
}

export { commands, register };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
