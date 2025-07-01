import {
  sleep,
  createFFmpegStream,
  playStream,
  handleInteraction,
  guildAudioStates,
  GuildAudioState,
} from '../src/bot';

// @discordjs/voiceの関数を一括モック
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
  test('sleep関数が動作する', async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  test('createFFmpegStreamが関数である', () => {
    expect(typeof createFFmpegStream).toBe('function');
  });

  test('guildAudioStatesはMapである', () => {
    expect(guildAudioStates).toBeInstanceOf(Map);
  });

  test('GuildAudioState型が存在する', () => {
    // 型チェック用のダミーオブジェクト
    const dummy: GuildAudioState = {
      connection: null,
      player: null,
      streamKey: null,
      streamUrl: null,
      lastActivityTime: 0,
      isPlaying: false,
    };
    expect(dummy).toBeDefined();
  });

  test('playStream, handleInteractionが関数である', () => {
    expect(typeof playStream).toBe('function');
    expect(typeof handleInteraction).toBe('function');
  });

  // playStreamやhandleInteractionの詳細なモックテストは必要に応じて追加可能
});

describe('handleInteractionの分岐カバレッジ', () => {
  test('interactionがコマンドでない場合は何もしない', async () => {
    const fake = { isChatInputCommand: () => false };
    await expect(handleInteraction(fake)).resolves.toBeUndefined();
  });

  test('playコマンドでvoiceChannelが無い場合はエラーメッセージ', async () => {
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

  test('playコマンドでvoiceChannelが不正な場合はエラーメッセージ', async () => {
    const editReply = jest.fn();
    const deferReply = jest.fn();
    const fake = {
      isChatInputCommand: () => true,
      guildId: 'guild1',
      commandName: 'play',
      member: { voice: { channel: { type: 0 } } },
      deferReply,
      editReply,
    };
    await handleInteraction(fake);
    expect(editReply).toHaveBeenCalledWith('Please join a voice channel.');
  });

  test('playコマンドでjoinable/speakableでない場合はエラーメッセージ', async () => {
    const editReply = jest.fn();
    const deferReply = jest.fn();
    const fake = {
      isChatInputCommand: () => true,
      guildId: 'guild1',
      commandName: 'play',
      member: { voice: { channel: { type: 2, joinable: false, speakable: false } } },
      deferReply,
      editReply,
    };
    await handleInteraction(fake);
    expect(editReply).toHaveBeenCalledWith('Cannot join or speak in the voice channel.');
  });

  test('playコマンドでstreamkeyが無い場合はエラーメッセージ', async () => {
    const editReply = jest.fn();
    const deferReply = jest.fn();
    const fake = {
      isChatInputCommand: () => true,
      guildId: 'guild1',
      commandName: 'play',
      member: {
        voice: {
          channel: {
            type: 2,
            joinable: true,
            speakable: true,
            id: 'vc',
            guild: { voiceAdapterCreator: () => ({ sendPayload: () => true, destroy: () => {} }) },
          },
        },
      },
      deferReply,
      editReply,
      options: { get: () => undefined },
    };
    await handleInteraction(fake);
    expect(editReply).toHaveBeenCalledWith('streamkey is not specified.');
  });
});

// playStreamのエラー分岐カバレッジ例
describe('playStreamの分岐カバレッジ', () => {
  test('state.connection, streamUrl, streamKeyが無い場合は何もしない', async () => {
    const state = {
      connection: null,
      streamUrl: null,
      streamKey: null,
      player: null,
      lastActivityTime: 0,
      isPlaying: false,
    };
    const interaction = {} as any;
    await expect(playStream(state, interaction)).resolves.toBeUndefined();
  });
});

describe('playStreamの本体ロジック分岐', () => {
  let now = Date.now();
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    jest.spyOn(require('../src/bot'), 'createFFmpegStream').mockReturnValue({} as any);
    jest.spyOn(require('../src/bot'), 'sleep').mockResolvedValue(undefined);

    // createAudioPlayerのモック: play呼び出しでstate.statusをidleに
    const { createAudioPlayer } = require('@discordjs/voice');
    (createAudioPlayer as jest.Mock).mockImplementation(() => {
      const player: any = {
        play: jest.fn(() => {
          player.state.status = 'idle';
        }),
        state: { status: 'playing' },
        on: jest.fn(),
      };
      return player;
    });

    // entersState: 1回目Playing, 2回目Idle, 以降throw
    let call = 0;
    const { entersState } = require('@discordjs/voice');
    (entersState as jest.Mock).mockImplementation(async (player, status) => {
      call++;
      if (call === 1 && status === 'playing') return player;
      if (call === 2 && status === 'idle') return player;
      throw new Error('test end');
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('正常再生パス', async () => {
    const editReply = jest.fn();
    const state = {
      connection: { subscribe: jest.fn(), destroy: jest.fn(), state: { status: 'ready' } },
      player: null,
      streamKey: 'key',
      streamUrl: 'url',
      lastActivityTime: now,
      isPlaying: false,
    };
    const interaction = { editReply } as any;
    let entersStateCall = 0;
    const { entersState } = require('@discordjs/voice');
    (entersState as jest.Mock).mockImplementation(async (player, status) => {
      entersStateCall++;
      if (entersStateCall === 1 && status === 'playing') return player;
      if (entersStateCall === 2 && status === 'idle') return player;
      throw new Error('test end');
    });
    let playCount = 0;
    const { createAudioPlayer } = require('@discordjs/voice');
    (createAudioPlayer as jest.Mock).mockImplementation(() => {
      const player: any = {
        play: jest.fn(() => {
          playCount++;
          player.state.status = playCount === 1 ? 'playing' : 'idle';
        }),
        state: { status: 'playing' },
        on: jest.fn(),
      };
      return player;
    });
    await require('../src/bot').playStream(state, interaction, false, { maxLoop: 2 });
    expect(editReply).toHaveBeenCalledWith('Playing key.');
  });

  test('entersState失敗時のcatch分岐', async () => {
    const { entersState } = require('@discordjs/voice');
    (entersState as jest.Mock).mockImplementationOnce(async () => {
      throw new Error('fail');
    });
    const editReply = jest.fn();
    const state = {
      connection: { subscribe: jest.fn(), destroy: jest.fn(), state: { status: 'ready' } },
      player: null,
      streamKey: 'key',
      streamUrl: 'url',
      lastActivityTime: now,
      isPlaying: false,
    };
    const interaction = { editReply } as any;
    await require('../src/bot').playStream(state, interaction, false, { maxLoop: 1 });
    expect(editReply).toHaveBeenCalledWith('Failed to play stream.');
  });

  test('isResync分岐', async () => {
    const editReply = jest.fn();
    const state = {
      connection: { subscribe: jest.fn(), destroy: jest.fn(), state: { status: 'ready' } },
      player: null,
      streamKey: 'key',
      streamUrl: 'url',
      lastActivityTime: now,
      isPlaying: false,
    };
    const interaction = { editReply } as any;
    let entersStateCall = 0;
    const { entersState } = require('@discordjs/voice');
    (entersState as jest.Mock).mockImplementation(async (player, status) => {
      entersStateCall++;
      if (entersStateCall === 1 && status === 'playing') return player;
      if (entersStateCall === 2 && status === 'idle') return player;
      throw new Error('test end');
    });
    let playCount = 0;
    const { createAudioPlayer } = require('@discordjs/voice');
    (createAudioPlayer as jest.Mock).mockImplementation(() => {
      const player: any = {
        play: jest.fn(() => {
          playCount++;
          player.state.status = playCount === 1 ? 'playing' : 'idle';
        }),
        state: { status: 'playing' },
        on: jest.fn(),
      };
      return player;
    });
    await require('../src/bot').playStream(state, interaction, true, { maxLoop: 2 });
    expect(editReply).toHaveBeenCalledWith('Playing key.');
  });

  test('30分アイドルで自動切断', async () => {
    let entersStateCall = 0;
    const { entersState } = require('@discordjs/voice');
    (entersState as jest.Mock).mockImplementation(async (player, status) => {
      if (status === 'playing') return player;
      if (status === 'idle') {
        entersStateCall++;
        if (entersStateCall === 2) now += 1800001;
        if (entersStateCall === 3) throw new Error('test end');
        return player;
      }
      throw new Error('entersState error');
    });
    let playCount = 0;
    const { createAudioPlayer } = require('@discordjs/voice');
    (createAudioPlayer as jest.Mock).mockImplementation(() => {
      const player: any = {
        play: jest.fn(() => {
          playCount++;
          player.state.status = playCount === 1 ? 'playing' : 'idle';
        }),
        state: { status: 'playing' },
        on: jest.fn(),
      };
      return player;
    });
    const editReply = jest.fn();
    const destroy = jest.fn();
    const state = {
      connection: { subscribe: jest.fn(), destroy, state: { status: 'ready' } },
      player: null,
      streamKey: 'key',
      streamUrl: 'url',
      lastActivityTime: now,
      isPlaying: false,
    };
    const interaction = { editReply } as any;
    await require('../src/bot').playStream(state, interaction, false, { maxLoop: 3 });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe('handleInteractionのresync/stopコマンド分岐', () => {
  beforeEach(() => {
    // joinVoiceChannelのデフォルトをリセット
    const { joinVoiceChannel } = require('@discordjs/voice');
    (joinVoiceChannel as jest.Mock).mockReturnValue({
      subscribe: jest.fn(),
      destroy: jest.fn(),
      state: { status: 'ready' },
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('resyncコマンドでstreamkey無しはエラー', async () => {
    const editReply = jest.fn();
    const deferReply = jest.fn();
    const fake = {
      isChatInputCommand: () => true,
      guildId: 'guild1',
      commandName: 'resync',
      member: {
        voice: { channel: { type: 2, id: 'vc', guild: { voiceAdapterCreator: () => ({}) } } },
      },
      deferReply,
      editReply,
      options: { get: () => undefined },
    };
    await require('../src/bot').handleInteraction(fake);
    expect(editReply).toHaveBeenCalledWith('streamkey is not specified.');
  });

  test('stopコマンドで正常にDestroyed.を返す', async () => {
    const editReply = jest.fn();
    const deferReply = jest.fn();
    // 事前にguildAudioStatesに状態をセット
    require('../src/bot').guildAudioStates.set('guild1', {
      connection: { destroy: jest.fn(), subscribe: jest.fn(), state: { status: 'ready' } },
      player: null,
      streamKey: 'key',
      streamUrl: 'url',
      lastActivityTime: Date.now(),
      isPlaying: true,
    });
    const fake = {
      isChatInputCommand: () => true,
      guildId: 'guild1',
      commandName: 'stop',
      member: {
        voice: { channel: { type: 2, id: 'vc', guild: { voiceAdapterCreator: () => ({}) } } },
      },
      deferReply,
      editReply,
    };
    await require('../src/bot').handleInteraction(fake);
    expect(editReply).toHaveBeenCalledWith('Destroyed.');
  });
});
