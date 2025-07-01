// Jest test for register.ts
// Only basic structure and type checks (mocked, no Discord API calls)
import { Client, ApplicationCommandData, GatewayIntentBits } from 'discord.js';
import * as registerModule from '../src/register';

describe('register.ts', () => {
  test('コマンドデータが正しく定義されている', () => {
    expect(Array.isArray((registerModule as any).commands)).toBe(true);
    const commands = (registerModule as any).commands as ApplicationCommandData[];
    expect(commands.some((cmd) => cmd.name === 'play')).toBe(true);
    expect(commands.some((cmd) => cmd.name === 'resync')).toBe(true);
    expect(commands.some((cmd) => cmd.name === 'stop')).toBe(true);
  });

  test('register関数が存在する', () => {
    expect(typeof (registerModule as any).register).toBe('function');
  });

  test('Clientインスタンスが生成できる', () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    expect(client).toBeInstanceOf(Client);
  });

  test('register関数はclient.applicationが無いときエラーを投げる', async () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    // @ts-ignore
    client.application = undefined;
    await expect((registerModule as any).register(client, [])).rejects.toThrow(
      'Client application is not ready.'
    );
  });

  test('register関数はguildID無しでapplication.commands.setを呼ぶ', async () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    (client as any).application = {
      commands: {
        set: jest.fn().mockResolvedValue('called'),
      },
    };
    const result = await (registerModule as any).register(client, [
      { name: 'dummy', description: 'd' },
    ]);
    expect((client as any).application.commands.set).toHaveBeenCalled();
    expect(result).toBe('called');
  });

  test('register関数はguildID有りでguilds.fetchとguild.commands.setを呼ぶ', async () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const mockSet = jest.fn().mockResolvedValue('guild-called');
    const mockGuild = { commands: { set: mockSet } };
    (client as any).application = { commands: { set: jest.fn() } };
    (client as any).guilds = { fetch: jest.fn().mockResolvedValue(mockGuild) };
    const result = await (registerModule as any).register(
      client,
      [{ name: 'dummy', description: 'd' }],
      'guildid'
    );
    expect((client as any).guilds.fetch).toHaveBeenCalledWith('guildid');
    expect(mockSet).toHaveBeenCalled();
    expect(result).toBe('guild-called');
  });
});
