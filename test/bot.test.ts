import {
  handlePlayCommand,
  handleStopCommand,
  handleResyncCommand,
  handleInteraction,
  createFFmpegStream,
  sleep,
  guildAudioStates,
  playStream,
} from '../src/bot';
import { joinVoiceChannel, VoiceConnectionStatus, AudioPlayerStatus } from '@discordjs/voice';
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  VoiceBasedChannel,
} from 'discord.js';

// Mock child_process first to avoid initialization issues
jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    stdout: { on: jest.fn(), pipe: jest.fn() },
    stderr: { on: jest.fn(), pipe: jest.fn() },
    on: jest.fn(),
    kill: jest.fn(),
  }),
}));

// Mock Discord API interactions since most of bot.ts involves Discord API calls
jest.mock('@discordjs/voice', () => ({
  ...jest.requireActual('@discordjs/voice'),
  joinVoiceChannel: jest.fn(),
  getVoiceConnection: jest.fn(),
  createAudioPlayer: jest.fn().mockReturnValue({
    on: jest.fn((event, listener) => {
      // Immediately trigger 'idle' event to make testing playback completion logic easier
      if (event === AudioPlayerStatus.Idle) {
        listener();
      }
    }),
    play: jest.fn(),
    stop: jest.fn(),
    state: {},
    subscribe: jest.fn(),
  }),
  createAudioResource: jest.fn(),
}));

const mockJoinVoiceChannel = joinVoiceChannel as jest.Mock;

// Helper function to generate mock Interaction for testing
const createMockInteraction = (
  options: Partial<ChatInputCommandInteraction> = {}
): ChatInputCommandInteraction => {
  const member = {
    voice: {
      channel: {
        id: 'mock-channel-id',
        type: 2, // ChannelType.GuildVoice
        joinable: true,
        speakable: true,
        guild: {
          id: 'mock-guild-id',
          voiceAdapterCreator: jest.fn(),
        },
      } as unknown as VoiceBasedChannel,
    },
  } as GuildMember;

  const guild = {
    id: 'mock-guild-id',
    voiceAdapterCreator: jest.fn(),
  } as unknown as Guild;

  const interaction: Partial<ChatInputCommandInteraction> = {
    guildId: 'mock-guild-id',
    guild,
    member,
    options: {
      getString: jest.fn().mockReturnValue('test-stream-key'),
      get: jest.fn().mockReturnValue({ value: 'test-stream-key' }),
      getSubcommand: jest.fn(),
      getSubcommandGroup: jest.fn(),
      getInteger: jest.fn(),
      getNumber: jest.fn(),
      getBoolean: jest.fn(),
      getUser: jest.fn(),
      getMember: jest.fn(),
      getRole: jest.fn(),
      getChannel: jest.fn(),
      getMentionable: jest.fn(),
      getAttachment: jest.fn(),
    } as any,
    reply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    ...options,
  };

  return interaction as ChatInputCommandInteraction;
};

describe('bot.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear guild audio states before each test
    guildAudioStates.clear();
    // Ensure test environment is detected
    process.env.JEST_WORKER_ID = '1';
  });

  // Move existing tests here
  test('sleep function works correctly', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  test('createFFmpegStream is a function', () => {
    expect(typeof createFFmpegStream).toBe('function');
  });

  describe('handlePlayCommand', () => {
    it('should return error message when user is not in a voice channel', async () => {
      const interaction = createMockInteraction();
      interaction.member = { voice: { channel: null } } as GuildMember;

      await handlePlayCommand(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        'You need to be in a voice channel to play music!'
      );
    });

    it('should return already playing message when already playing', async () => {
      const interaction = createMockInteraction();
      const mockConnection = {
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
        destroy: jest.fn(),
      };
      mockJoinVoiceChannel.mockReturnValue(mockConnection);

      // Pre-set the guild state to have isPlaying=true to prevent playStream execution
      guildAudioStates.set('mock-guild-id', {
        connection: mockConnection as any,
        player: null,
        streamKey: null,
        streamUrl: null,
        lastActivityTime: Date.now(),
        isPlaying: true,
        ffmpegProcess: null,
      });

      await handlePlayCommand(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('Already playing.');
    });
  });

  describe('handleStopCommand', () => {
    it('should destroy connection and reply message when bot is in voice channel', async () => {
      const mockDestroy = jest.fn();
      const mockConnection = {
        destroy: mockDestroy,
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
      };

      // Set up guild state with connection
      const interaction = createMockInteraction();
      guildAudioStates.set('mock-guild-id', {
        connection: mockConnection as any,
        player: null,
        streamKey: 'test-key',
        streamUrl: null,
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      });

      await handleStopCommand(interaction);

      expect(mockDestroy).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith('Stopped playing and left the channel.');
    });

    it('should reply message when bot is not in voice channel', async () => {
      const interaction = createMockInteraction();

      await handleStopCommand(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('Not in a voice channel.');
    });
  });

  // Tests for handleResyncCommand
  describe('handleResyncCommand', () => {
    it('should resync the connection if it exists', async () => {
      const interaction = createMockInteraction();
      interaction.guildId = 'test-guild';
      // Mock the getString method to return test-key
      (interaction.options.getString as jest.Mock).mockReturnValue('test-key');

      // Set up existing state
      const mockConnection = {
        destroy: jest.fn(),
        on: jest.fn(),
        subscribe: jest.fn(),
        rejoinAttempts: 0,
        _state: { status: VoiceConnectionStatus.Ready },
        joinConfig: {},
      } as any;

      const mockState = {
        connection: mockConnection,
        player: null,
        streamKey: 'old-key',
        streamUrl: 'rtsp://topaz.chat/live/old-key',
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      };
      guildAudioStates.set('test-guild', mockState);

      mockJoinVoiceChannel.mockReturnValue({
        on: jest.fn(),
        subscribe: jest.fn(),
        destroy: jest.fn(),
      });

      await handleResyncCommand(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(mockConnection.destroy).toHaveBeenCalled();
      expect(mockJoinVoiceChannel).toHaveBeenCalledWith({
        channelId: 'mock-channel-id',
        guildId: 'test-guild',
        adapterCreator: expect.any(Function),
      });
    });

    it('should handle missing streamkey by using existing one', async () => {
      const interaction = createMockInteraction();
      interaction.guildId = 'test-guild';
      // Mock the getString method to return null (no streamkey provided)
      (interaction.options.getString as jest.Mock).mockReturnValue(null);

      // Set up existing state with streamkey
      const mockState = {
        connection: null,
        player: null,
        streamKey: 'existing-key',
        streamUrl: 'rtsp://topaz.chat/live/existing-key',
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      };
      guildAudioStates.set('test-guild', mockState);

      mockJoinVoiceChannel.mockReturnValue({
        on: jest.fn(),
        subscribe: jest.fn(),
        destroy: jest.fn(),
      });

      await handleResyncCommand(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(mockJoinVoiceChannel).toHaveBeenCalled();
      expect(mockState.streamKey).toBe('existing-key');
    });

    it('should reply with error if no streamkey is available', async () => {
      const interaction = createMockInteraction();
      interaction.guildId = 'test-guild';
      // Mock the getString method to return null (no streamkey provided)
      (interaction.options.getString as jest.Mock).mockReturnValue(null);

      // Set up state without streamkey
      const mockState = {
        connection: null,
        player: null,
        streamKey: null,
        streamUrl: null,
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      };
      guildAudioStates.set('test-guild', mockState);

      await handleResyncCommand(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith('streamkey is not specified.');
    });

    it('should reply with error if user is not in voice channel', async () => {
      const interaction = createMockInteraction();
      interaction.member = { voice: { channel: null } } as GuildMember;

      await handleResyncCommand(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith('Please join a voice channel.');
    });
  });

  describe('createFFmpegStream', () => {
    it('should return empty stream in test environment', () => {
      const stream = createFFmpegStream('rtsp://test.com/stream');
      expect(stream).toBeDefined();
      expect(stream.readable).toBe(true);
    });
  });

  describe('handlePlayCommand - additional edge cases', () => {
    it('should return error when voice channel is not joinable', async () => {
      const interaction = createMockInteraction();
      // Override member with non-joinable voice channel
      interaction.member = {
        voice: {
          channel: {
            id: 'mock-channel-id',
            type: 2, // ChannelType.GuildVoice
            joinable: false, // Not joinable
            speakable: true,
            guild: {
              id: 'mock-guild-id',
              voiceAdapterCreator: jest.fn(),
            },
          },
        },
      } as unknown as GuildMember;

      await handlePlayCommand(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        'Cannot join or speak in the voice channel.'
      );
    });

    it('should return error when voice channel is not speakable', async () => {
      const interaction = createMockInteraction();
      // Override member with non-speakable voice channel
      interaction.member = {
        voice: {
          channel: {
            id: 'mock-channel-id',
            type: 2, // ChannelType.GuildVoice
            joinable: true,
            speakable: false, // Not speakable
            guild: {
              id: 'mock-guild-id',
              voiceAdapterCreator: jest.fn(),
            },
          },
        },
      } as unknown as GuildMember;

      await handlePlayCommand(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        'Cannot join or speak in the voice channel.'
      );
    });

    it('should return error when streamkey is not provided', async () => {
      const interaction = createMockInteraction();
      (interaction.options.getString as jest.Mock).mockReturnValue(null);

      await handlePlayCommand(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('streamkey is not specified.');
    });

    it('should handle destroyed connection state', async () => {
      const interaction = createMockInteraction();
      const mockConnection = {
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Destroyed },
        destroy: jest.fn(),
      };

      // Pre-set the guild state with destroyed connection
      guildAudioStates.set('mock-guild-id', {
        connection: mockConnection as any,
        player: null,
        streamKey: null,
        streamUrl: null,
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      });

      const newMockConnection = {
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
        destroy: jest.fn(),
      };
      mockJoinVoiceChannel.mockReturnValue(newMockConnection);

      await handlePlayCommand(interaction);

      expect(mockJoinVoiceChannel).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith('Playing stream: test-stream-key');
    });
  });

  describe('handleStopCommand - additional edge cases', () => {
    it('should handle ffmpeg process cleanup', async () => {
      const mockKill = jest.fn();
      const mockFFmpegProcess = {
        kill: mockKill,
      };

      const mockConnection = {
        destroy: jest.fn(),
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
      };

      const interaction = createMockInteraction();
      guildAudioStates.set('mock-guild-id', {
        connection: mockConnection as any,
        player: null,
        streamKey: 'test-key',
        streamUrl: null,
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: mockFFmpegProcess as any,
      });

      await handleStopCommand(interaction);

      expect(mockKill).toHaveBeenCalled();
      expect(mockConnection.destroy).toHaveBeenCalled();
    });
  });

  describe('Edge cases without guildId', () => {
    it('should return early if no guildId in handlePlayCommand', async () => {
      const interaction = createMockInteraction();
      interaction.guildId = null;

      await handlePlayCommand(interaction);

      // Should not call deferReply if no guildId
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it('should return early if no guildId in handleStopCommand', async () => {
      const interaction = createMockInteraction();
      interaction.guildId = null;

      await handleStopCommand(interaction);

      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it('should return early if no guildId in handleResyncCommand', async () => {
      const interaction = createMockInteraction();
      interaction.guildId = null;

      await handleResyncCommand(interaction);

      expect(interaction.deferReply).not.toHaveBeenCalled();
    });
  });

  describe('handleInteraction', () => {
    const createMockChatInputCommand = (commandName: string, options: any = {}) => {
      return {
        isChatInputCommand: () => true,
        guildId: 'mock-guild-id',
        commandName,
        member: {
          voice: {
            channel: {
              id: 'mock-channel-id',
              type: 2, // ChannelType.GuildVoice
              joinable: true,
              speakable: true,
              guild: {
                id: 'mock-guild-id',
                voiceAdapterCreator: jest.fn(),
              },
            },
          },
        } as unknown as GuildMember,
        options: {
          get: jest.fn().mockReturnValue({ value: 'test-stream-key' }),
          ...options,
        },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        ...options,
      };
    };

    it('should handle play command through handleInteraction', async () => {
      const interaction = createMockChatInputCommand('play');
      mockJoinVoiceChannel.mockReturnValue({
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
        destroy: jest.fn(),
      });

      await handleInteraction(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
    });

    it('should handle resync command through handleInteraction', async () => {
      const interaction = createMockChatInputCommand('resync');
      mockJoinVoiceChannel.mockReturnValue({
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
        destroy: jest.fn(),
      });

      await handleInteraction(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
    });

    it('should handle stop command through handleInteraction', async () => {
      const interaction = createMockChatInputCommand('stop');

      await handleInteraction(interaction);

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith('Destroyed.');
    });

    it('should return early for non-chat input commands', async () => {
      const interaction = {
        isChatInputCommand: () => false,
        guildId: 'mock-guild-id',
        deferReply: jest.fn(),
      } as any;

      await handleInteraction(interaction);

      // Should not proceed to command handling
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it('should return early for commands without guildId', async () => {
      const interaction = {
        isChatInputCommand: () => true,
        guildId: null,
        deferReply: jest.fn(),
      } as any;

      await handleInteraction(interaction);

      // Should not proceed to command handling
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it('should handle play command with missing streamkey', async () => {
      const interaction = createMockChatInputCommand('play');
      interaction.options.get = jest.fn().mockReturnValue(null);

      await handleInteraction(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('streamkey is not specified.');
    });

    it('should handle play command when user not in voice channel', async () => {
      const interaction = createMockChatInputCommand('play');
      interaction.member.voice.channel = null;

      await handleInteraction(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('Please join a voice channel.');
    });

    it('should handle resync command with missing streamkey', async () => {
      const interaction = createMockChatInputCommand('resync');
      interaction.options.get = jest.fn().mockReturnValue(null);

      await handleInteraction(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('streamkey is not specified.');
    });

    it('should handle resync command when user not in voice channel', async () => {
      const interaction = createMockChatInputCommand('resync');
      interaction.member.voice.channel = null;

      await handleInteraction(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('Please join a voice channel.');
    });

    it('should handle already playing case in play command', async () => {
      const interaction = createMockChatInputCommand('play');

      // Set state to already playing
      guildAudioStates.set('mock-guild-id', {
        connection: null,
        player: null,
        streamKey: null,
        streamUrl: null,
        lastActivityTime: Date.now(),
        isPlaying: true,
        ffmpegProcess: null,
      });

      await handleInteraction(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('Already playing.');
    });
  });

  describe('playStream function', () => {
    it('should handle invalid state (no connection)', async () => {
      const mockState = {
        connection: null,
        player: null,
        streamKey: 'test-key',
        streamUrl: 'rtsp://test.com/stream',
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      };
      const mockInteraction = createMockInteraction();

      await playStream(mockState, mockInteraction);

      // Should return early without doing anything
      expect(mockInteraction.editReply).not.toHaveBeenCalled();
    });

    it('should handle invalid state (no streamUrl)', async () => {
      const mockConnection = {
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
        destroy: jest.fn(),
      };
      const mockState = {
        connection: mockConnection as any,
        player: null,
        streamKey: 'test-key',
        streamUrl: null,
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      };
      const mockInteraction = createMockInteraction();

      await playStream(mockState, mockInteraction);

      // Should return early without doing anything
      expect(mockInteraction.editReply).not.toHaveBeenCalled();
    });

    it('should handle invalid state (no streamKey)', async () => {
      const mockConnection = {
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
        destroy: jest.fn(),
      };
      const mockState = {
        connection: mockConnection as any,
        player: null,
        streamKey: null,
        streamUrl: 'rtsp://test.com/stream',
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      };
      const mockInteraction = createMockInteraction();

      await playStream(mockState, mockInteraction);

      // Should return early without doing anything
      expect(mockInteraction.editReply).not.toHaveBeenCalled();
    });

    it('should handle playStream with forceBreak option', async () => {
      const mockConnection = {
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
        destroy: jest.fn(),
      };
      const mockState = {
        connection: mockConnection as any,
        player: null,
        streamKey: 'test-key',
        streamUrl: 'rtsp://test.com/stream',
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      };
      const mockInteraction = createMockInteraction();

      await playStream(mockState, mockInteraction, false, { forceBreak: true });

      // Should break immediately with forceBreak option
      expect(mockConnection.destroy).not.toHaveBeenCalled();
    });

    it('should handle playStream in test environment', async () => {
      const mockConnection = {
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
        destroy: jest.fn(),
      };
      const mockState = {
        connection: mockConnection as any,
        player: null,
        streamKey: 'test-key',
        streamUrl: 'rtsp://test.com/stream',
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      };
      const mockInteraction = createMockInteraction();

      await playStream(mockState, mockInteraction);

      // In test environment, should edit reply and destroy connection
      expect(mockInteraction.editReply).toHaveBeenCalledWith('Playing test-key.');
      expect(mockConnection.destroy).toHaveBeenCalled();
    });

    it('should handle resync playStream', async () => {
      const mockConnection = {
        subscribe: jest.fn(),
        on: jest.fn(),
        state: { status: VoiceConnectionStatus.Ready },
        destroy: jest.fn(),
      };
      const mockState = {
        connection: mockConnection as any,
        player: null,
        streamKey: 'test-key',
        streamUrl: 'rtsp://test.com/stream',
        lastActivityTime: Date.now(),
        isPlaying: false,
        ffmpegProcess: null,
      };
      const mockInteraction = createMockInteraction();

      await playStream(mockState, mockInteraction, true);

      // Should handle resync case
      expect(mockInteraction.editReply).toHaveBeenCalledWith('Playing test-key.');
      expect(mockConnection.destroy).toHaveBeenCalled();
    });
  });
});
