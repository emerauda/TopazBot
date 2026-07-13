// Slash command registration script for the single-guild FetherBot deployment.
// Usage: node register.js [guildId]   (omit guildId to register globally)
const { Client, GatewayIntentBits, InteractionContextType } = require('discord.js');
const { readFileSync } = require('fs');

// Simple .env loader (same behavior as src/index.ts)
try {
    const env = readFileSync('.env', 'utf-8');
    env.split('\n').forEach(line => {
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

const token = process.env.DISCORD_TOKEN;
if (!token) {
    throw new Error('DISCORD_TOKEN is not set in environment variables.');
}
// Command names carry the NUMBER suffix so they match the handler in src/index.ts
const number = process.env.NUMBER ?? '';

// The bot plays a fixed stream key (STREAM + NUMBER), so the commands take no
// options. All commands operate on voice channels and are guild-only.
const commands = [
    {
        name: `play${number}`,
        description: 'Play TopazChat music',
        contexts: [InteractionContextType.Guild],
    },
    {
        name: `resync${number}`,
        description: 'Resync TopazChat music',
        contexts: [InteractionContextType.Guild],
    },
    {
        name: `stop${number}`,
        description: 'Stop TopazChat music',
        contexts: [InteractionContextType.Guild],
    },
];

/**
 * @param {Client} client
 * @param {import("discord.js").ApplicationCommandData[]} cmds
 * @param {import("discord.js").Snowflake} [guildID]
 */
async function register(client, cmds, guildID) {
    if (!client.application) throw new Error('Client application is not ready.');
    if (!guildID) {
        return client.application.commands.set(cmds);
    }
    const guild = await client.guilds.fetch(guildID);
    return guild.commands.set(cmds);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function main() {
    await client.login(token);
    if (!client.application) throw new Error('Client application is not ready after login.');
    await client.application.fetch();
    await register(client, commands, process.argv[2]);
    console.log('registration succeed!');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
