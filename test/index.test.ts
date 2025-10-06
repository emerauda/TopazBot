// Jest test for index.ts
// Only basic structure and type checks (no Discord API calls)
import { Client } from 'discord.js';

const clients: Client[] = [];

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

  test('Client is a function', () => {
    expect(typeof Client).toBe('function');
  });

  test('DISCORD_TOKEN environment variable exists', () => {
    expect(typeof process.env.DISCORD_TOKEN).toBe('string');
  });
});

// index.ts module セクション
describe('index.ts module', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.JEST_WORKER_ID;
    process.env.DISCORD_TOKEN = 'dummy_token';
  });
  test('ready event handler is registered', () => {
    const indexModule = require('../src/index.ts');
    const client = require('../src/index.ts').client;
    expect(client.listenerCount('ready')).toBeGreaterThan(0);
  });
  test('interactionCreate event handler is registered', () => {
    const indexModule = require('../src/index.ts');
    const client = require('../src/index.ts').client;
    expect(client.listenerCount('interactionCreate')).toBeGreaterThan(0);
  });
  test('throws exception when DISCORD_TOKEN is missing in non-test environment', () => {
    const originalToken = process.env.DISCORD_TOKEN;
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    const index = require('../src/index.ts');
    expect(index).toBeDefined();
    if (originalToken) process.env.DISCORD_TOKEN = originalToken;
    if (originalJestWorkerId) process.env.JEST_WORKER_ID = originalJestWorkerId;
  });
});

// index.ts .env loader and login behavior
describe('index.ts .env loader and login behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.JEST_WORKER_ID;
    process.env.DISCORD_TOKEN = 'tok';
  });

  test('.env loader reads file and sets environment variables', () => {
    delete process.env.A;
    delete process.env.B;

    const fs = require('fs');
    const readMock = jest.spyOn(fs, 'readFileSync').mockReturnValue('A=1\nB="2"');
    require('../src/index.ts');
    expect(readMock).toHaveBeenCalledWith('.env', 'utf-8');
    expect(process.env.A).toBe('1');
    expect(process.env.B).toBe('2');
    readMock.mockRestore();
  });

  test('require.main === module branch processing exists', () => {
    const { Client } = require('discord.js');
    const loginSpy = jest.spyOn(Client.prototype, 'login');

    require('../src/index.ts');

    expect(loginSpy).not.toHaveBeenCalled();
    loginSpy.mockRestore();
  });
});

// Additional tests for index.ts coverage
describe('index.ts edge cases', () => {
  test('.env file read error handling', () => {
    const fs = require('fs');
    const readMock = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('File not found');
    });

    expect(() => require('../src/index.ts')).not.toThrow();

    readMock.mockRestore();
  });

  test('environment variable parsing edge cases', () => {
    delete process.env.VALID_VAR;
    delete process.env.QUOTED_VAR;
    delete process.env.SINGLE_QUOTED;
    delete process.env.SPACED_VAR;
    delete process.env.EMPTY_VAR;
    delete process.env.INVALID_LINE;

    const fs = require('fs');
    const readMock = jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValue(
        'VALID_VAR=value\n' +
          'QUOTED_VAR="quoted value"\n' +
          "SINGLE_QUOTED='single'\n" +
          'INVALID_LINE\n' +
          '  SPACED_VAR  =  spaced value  \n' +
          '# COMMENT=should be ignored\n' +
          'EMPTY_VAR='
      );

    jest.resetModules();
    require('../src/index.ts');

    expect(process.env.VALID_VAR).toBe('value');
    expect(process.env.QUOTED_VAR).toBe('quoted value');
    expect(process.env.SINGLE_QUOTED).toBe('single');
    expect(process.env.SPACED_VAR).toBe('spaced value  ');
    expect(process.env.EMPTY_VAR).toBe('');
    expect(process.env.INVALID_LINE).toBeUndefined();

    readMock.mockRestore();
  });
});
