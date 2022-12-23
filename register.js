const { Client, ClientApplication } = require("discord.js");
const { token, deployment_guild_id } = require('./config.json');
/**
 *
 * @param {Client} client
 * @param {import("discord.js").ApplicationCommandData[]} commands
 * @param {import("discord.js").Snowflake} guildID
 * @returns {Promise<import("@discordjs/collection").Collection<string,import("discord.js").ApplicationCommand>>}
 */
async function register(client, commands, guildID) {
    if (guildID == null) {
        return client.application.commands.set(commands);
    }
    const guild = await client.guilds.fetch(guildID);
    return guild.commands.set(commands);
}
const ping = {
    name: "play",
    description: "Play TopazChat music",
    options: [
        {
            name: 'streamkey',
            type: 'STRING',
            description: 'The StreamKey of the music to play',
            required: true,
        },
    ],
};
const pingResync = { 
    name: "resync",
    description: "Resync TopazChat music",
};

const pingStop = {
    name: "stop",
    description: "Stop TopazChat music",
};
const commands = [ping, pingResync, pingStop];
const client = new Client({
    intents: 0,
});
client.token = token;
async function main() {
    client.application = new ClientApplication(client, {});
    await client.application.fetch();
    await register(client, commands, process.argv[2]);
    console.log("registration succeed!");
}
main().catch(err => console.error(err));
