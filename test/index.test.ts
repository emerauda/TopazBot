// Jest test for index.ts
// Only basic structure and type checks (no Discord API calls)
import { Client, GatewayIntentBits } from 'discord.js';
import { sleep, createFFmpegStream } from '../src/bot';

let clients: Client[] = [];

describe('index.ts', () => {
  beforeAll(() => {
    process.env.DISCORD_TOKEN = 'dummy_token';
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(async () => {
    clients.forEach((c) => c.destroy());
    await new Promise((res) => setTimeout(res, 200));
    (console.log as jest.Mock).mockRestore?.();
  });

  test('Clientが関数である', () => {
    expect(typeof Client).toBe('function');
  });

  test('環境変数DISCORD_TOKENが存在する', () => {
    expect(typeof process.env.DISCORD_TOKEN).toBe('string');
  });

  test('sleep関数が正しく動作する', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  test('exportされたsleep関数が正しく動作する', async () => {
    const start = Date.now();
    await sleep(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });

  test('exportされたcreateFFmpegStreamが関数である', () => {
    expect(typeof createFFmpegStream).toBe('function');
  });
});

describe('index.ts module', () => {
  test('ready イベントハンドラが登録されている', () => {
    const { client } = require('../src/index');
    expect(client.listenerCount('ready')).toBeGreaterThan(0);
  });
  test('interactionCreate イベントハンドラが登録されている', () => {
    const { client } = require('../src/index');
    expect(client.listenerCount('interactionCreate')).toBeGreaterThan(0);
  });
  test('DISCORD_TOKEN がないと例外を投げる', () => {
    // 環境変数をクリアして再モジュールロード
    delete process.env.DISCORD_TOKEN;
    jest.resetModules();
    expect(() => require('../src/index')).toThrow(/DISCORD_TOKEN is not set/);
  });
});
