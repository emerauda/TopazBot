// Command registration script for Discord bot (TypeScript)
// ESLint/Prettier rules applied
import {
  Client,
  ApplicationCommandData,
  ApplicationCommandOptionType,
  InteractionContextType,
  Snowflake,
  Collection,
  GatewayIntentBits,
  ApplicationCommand,
} from 'discord.js';
import { loadEnvFile } from './env';

// .env loader (skipped in test environment)
loadEnvFile();

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
): Promise<Collection<string, ApplicationCommand>> {
  if (!client.application) throw new Error('Client application is not ready.');
  if (!guildID) {
    return client.application.commands.set(commands);
  }
  const guild = await client.guilds.fetch(guildID);
  return guild.commands.set(commands);
}

// All commands operate on voice channels, so they only make sense inside guilds
const playCommand: ApplicationCommandData = {
  name: 'play',
  description: 'Play TopazChat music',
  contexts: [InteractionContextType.Guild],
  options: [
    {
      name: 'streamkey',
      type: ApplicationCommandOptionType.String,
      description: 'The StreamKey of the music to play',
      required: true,
    },
  ],
};
const resyncCommand: ApplicationCommandData = {
  name: 'resync',
  description: 'Resync TopazChat music',
  contexts: [InteractionContextType.Guild],
  options: [
    {
      name: 'streamkey',
      type: ApplicationCommandOptionType.String,
      description: 'The StreamKey to resync (defaults to the last played one)',
      required: false,
    },
  ],
};
const stopCommand: ApplicationCommandData = {
  name: 'stop',
  description: 'Stop TopazChat music',
  contexts: [InteractionContextType.Guild],
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
