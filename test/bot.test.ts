import {
  sleep,
  createFFmpegStream,
  playStream,
  handleInteraction,
  guildAudioStates,
  GuildAudioState,
} from '../src/bot';

// Mock Discord.js voice functions
jest.mock('@discordjs/voice', () => {
  const actual = jest.requireActual('@discordjs/voice');
  return {
    ...actual,
    createAudioResource: jest.fn(() => ({})),
    createAudioPlayer: jest.fn(() => ({
      play: jest.fn(),
      state: { status: 'playing' },
      on: jest.fn(),
    })),
    entersState: jest.fn(async (player, status) => player),
    joinVoiceChannel: jest.fn(() => ({
      subscribe: jest.fn(),
      destroy: jest.fn(),
      state: { status: 'ready' },
    })),
  };
});

describe('bot.ts', () => {
  test('sleep function works', async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  test('createFFmpegStream is a function', () => {
    expect(typeof createFFmpegStream).toBe('function');
  });

  test('createFFmpegStream returns empty stream in test environment', async () => {
    const stream = createFFmpegStream('dummy-url');
    const data: any[] = [];
    // @ts-ignore
    for await (const chunk of stream) data.push(chunk);
    expect(data).toEqual([]);
  });

  test('guildAudioStates is a Map', () => {
    expect(guildAudioStates).toBeInstanceOf(Map);
  });
});

describe('handleInteraction coverage', () => {
  test('non-command interaction returns undefined', async () => {
    const fake = { isChatInputCommand: () => false };
    await expect(handleInteraction(fake)).resolves.toBeUndefined();
  });

  test('play command without voice channel shows error', async () => {
    const editReply = jest.fn();
    const deferReply = jest.fn();
    const fake = {
      isChatInputCommand: () => true,
      guildId: 'guild1',
      commandName: 'play',
      member: { voice: { channel: null } },
      deferReply,
      editReply,
    };
    await handleInteraction(fake);
    expect(editReply).toHaveBeenCalledWith('Please join a voice channel.');
  });

  test('stop command without active stream shows message', async () => {
    guildAudioStates.clear();
    const editReply = jest.fn();
    const deferReply = jest.fn();
    const fake = {
      isChatInputCommand: () => true,
      guildId: 'guild2',
      commandName: 'stop',
      member: { voice: { channel: null } }, // Add member property
      deferReply,
      editReply,
    };
    await handleInteraction(fake);
    expect(editReply).toHaveBeenCalledWith('Destroyed.');
  });

  test('play command with valid voice channel succeeds', async () => {
    const editReply = jest.fn();
    const deferReply = jest.fn();
    const fake = {
      isChatInputCommand: () => true,
      guildId: 'guild1',
      commandName: 'play',
      member: {
        voice: {
          channel: {
            id: 'voiceChannel1',
            type: 2, // ChannelType.GuildVoice
            joinable: true,
            speakable: true,
            guild: {
              voiceAdapterCreator: jest.fn(),
            },
          },
        },
      },
      options: {
        getString: jest.fn(() => 'test-stream'),
        get: jest.fn(() => ({ value: 'test-stream' })),
      },
      deferReply,
      editReply,
    };
    await handleInteraction(fake);
    expect(editReply).toHaveBeenCalledWith('Playing test-stream.');
  });

  test('handleInteraction with missing guild', async () => {
    const mockInteraction = {
      isChatInputCommand: () => true,
      commandName: 'play',
      guildId: null, // This should be null to trigger the early return
      user: { tag: 'TestUser#0001' },
      reply: jest.fn(),
    } as any;

    await handleInteraction(mockInteraction);

    // With null guildId, the function should return early and not call reply
    expect(mockInteraction.reply).not.toHaveBeenCalled();
  });

  test('handleInteraction with user not in voice channel', async () => {
    const mockInteraction = {
      isChatInputCommand: () => true,
      commandName: 'play',
      guildId: 'guild1',
      member: { voice: { channel: null } },
      user: { tag: 'TestUser#0001' },
      deferReply: jest.fn(),
      editReply: jest.fn(),
    } as any;

    await handleInteraction(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('Please join a voice channel.');
  });
});

describe('playStream tests', () => {
  test('playStream is a function', () => {
    expect(typeof playStream).toBe('function');
  });

  test('playStream returns a promise', () => {
    const mockState: GuildAudioState = {
      connection: { subscribe: jest.fn(), destroy: jest.fn() } as any,
      player: { play: jest.fn(), state: { status: 'playing' }, on: jest.fn() } as any,
      streamKey: 'test-key',
      streamUrl: 'http://test.stream',
      lastActivityTime: Date.now(),
      isPlaying: false,
      ffmpegProcess: null,
    };
    const mockInteraction = {
      options: { getString: () => 'test' },
      editReply: jest.fn(),
    } as any;
    const result = playStream(mockState, mockInteraction);
    expect(result).toBeInstanceOf(Promise);
  });
});
