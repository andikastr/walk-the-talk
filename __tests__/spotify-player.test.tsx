import React, { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import {
  SpotifyPlayerProvider,
  useSpotifyPlayerContext,
} from '@/context/SpotifyPlayerContext';
import * as SpotifyPlayerService from '@/services/spotify/player';

const mockAuthState = { isAuthenticated: true };
let mockAppStateHandler: ((state: AppStateStatus) => void) | null = null;

jest.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({
    isAuthenticated: mockAuthState.isAuthenticated,
  }),
}));

jest.mock('@/services/spotify/player', () => {
  const actual = jest.requireActual('@/services/spotify/player') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    getPlaybackState: jest.fn(),
    getAvailableDevices: jest.fn(),
    playMusic: jest.fn(),
    playWithDeviceRecovery: jest.fn(),
    pauseMusic: jest.fn(),
    nextTrack: jest.fn(),
    previousTrack: jest.fn(),
    transferPlayback: jest.fn(),
  };
});

jest.mock('expo-linking', () => ({
  canOpenURL: jest.fn(async () => true),
  openURL: jest.fn(async () => {}),
}));

function TestConsumer({
  focusActive,
  onContextReady,
}: {
  focusActive: boolean;
  onContextReady: (ctx: ReturnType<typeof useSpotifyPlayerContext>) => void;
}) {
  const ctx = useSpotifyPlayerContext();

  useEffect(() => {
    onContextReady(ctx);
  }, [ctx, onContextReady]);

  useEffect(() => {
    if (!focusActive) return;
    return ctx.registerPollingConsumer();
  }, [ctx, focusActive]);

  return null;
}

describe('context/SpotifyPlayerContext (O4)', () => {
  const getPlaybackMock = SpotifyPlayerService.getPlaybackState as jest.MockedFunction<
    typeof SpotifyPlayerService.getPlaybackState
  >;
  const getDevicesMock = SpotifyPlayerService.getAvailableDevices as jest.MockedFunction<
    typeof SpotifyPlayerService.getAvailableDevices
  >;

  let appStateSpy: jest.SpiedFunction<typeof AppState.addEventListener>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockAuthState.isAuthenticated = true;
    mockAppStateHandler = null;
    AppState.currentState = 'active';
    getPlaybackMock.mockReset();
    getDevicesMock.mockReset();
    getPlaybackMock.mockResolvedValue({
      is_playing: true,
      repeat_state: 'off',
      shuffle_state: false,
      timestamp: 1_700_000_000_000,
      device: {
        id: 'dev_1',
        is_active: true,
        is_private_session: false,
        is_restricted: false,
        name: 'Phone',
        type: 'Smartphone',
        volume_percent: 80,
        supports_volume: true,
      },
      item: null,
      progress_ms: 1000,
    });
    getDevicesMock.mockResolvedValue([]);

    appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        mockAppStateHandler = listener;
        return { remove: jest.fn() } as any;
      });
  });

  afterEach(() => {
    appStateSpy.mockRestore();
    jest.useRealTimers();
  });

  it('avoids cold-boot /me/player/devices call and pauses polling without active consumers or when backgrounded', async () => {
    let capturedCtx!: ReturnType<typeof useSpotifyPlayerContext>;
    const handleCtx = (ctx: ReturnType<typeof useSpotifyPlayerContext>) => {
      capturedCtx = ctx;
    };

    // 1. Mount without active visible consumer (e.g. user on History screen): zero polling & zero device calls
    const view = await render(
      <SpotifyPlayerProvider>
        <TestConsumer focusActive={false} onContextReady={handleCtx} />
      </SpotifyPlayerProvider>
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(getPlaybackMock).toHaveBeenCalledTimes(0);
    expect(getDevicesMock).toHaveBeenCalledTimes(0);

    // 2. Activate visible consumer (e.g. Home / Record / Music tab focused)
    await view.rerender(
      <SpotifyPlayerProvider>
        <TestConsumer focusActive={true} onContextReady={handleCtx} />
      </SpotifyPlayerProvider>
    );

    expect(getPlaybackMock).toHaveBeenCalledTimes(1);
    expect(getDevicesMock).toHaveBeenCalledTimes(0);

    // Next active interval poll runs after 3000ms
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(getPlaybackMock).toHaveBeenCalledTimes(2);

    // 3. App moves to background -> polling stops cleanly
    await act(async () => {
      mockAppStateHandler?.('background');
      await jest.advanceTimersByTimeAsync(15_000);
    });
    expect(getPlaybackMock).toHaveBeenCalledTimes(2);

    // 4. App resumes to active -> syncs playback once and guards burst bounces via cooldown
    await act(async () => {
      mockAppStateHandler?.('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getPlaybackMock).toHaveBeenCalledTimes(3);

    // Rapid bounce back within 1200ms cooldown is debounced
    await act(async () => {
      mockAppStateHandler?.('inactive');
      mockAppStateHandler?.('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getPlaybackMock).toHaveBeenCalledTimes(3);

    // 5. Explicit refreshDevices works strictly on-demand
    await act(async () => {
      await capturedCtx.refreshDevices();
    });
    expect(getDevicesMock).toHaveBeenCalledTimes(1);

    // 6. Switching away to non-Spotify tab releases consumer & freezes polling
    await view.rerender(
      <SpotifyPlayerProvider>
        <TestConsumer focusActive={false} onContextReady={handleCtx} />
      </SpotifyPlayerProvider>
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(12_000);
    });
    expect(getPlaybackMock).toHaveBeenCalledTimes(3);
  });

  it('deduplicates concurrent forced refreshPlayback calls in-flight', async () => {
    let resolvePlayback!: (val: any) => void;
    getPlaybackMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePlayback = resolve;
        })
    );

    let capturedCtx!: ReturnType<typeof useSpotifyPlayerContext>;
    await render(
      <SpotifyPlayerProvider>
        <TestConsumer
          focusActive={false}
          onContextReady={(ctx) => {
            capturedCtx = ctx;
          }}
        />
      </SpotifyPlayerProvider>
    );

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    await act(async () => {
      p1 = capturedCtx.refreshPlayback();
      p2 = capturedCtx.refreshPlayback();
    });
    expect(getPlaybackMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePlayback({ is_playing: false, device: null, item: null, progress_ms: 0 });
      await Promise.all([p1, p2]);
    });
  });

  it('auto-dismisses transient player errors after 5 seconds', async () => {
    const nextMock = SpotifyPlayerService.nextTrack as jest.MockedFunction<
      typeof SpotifyPlayerService.nextTrack
    >;
    nextMock.mockRejectedValueOnce(new Error('Temporary playback error'));

    let capturedCtx!: ReturnType<typeof useSpotifyPlayerContext>;
    await render(
      <SpotifyPlayerProvider>
        <TestConsumer
          focusActive={false}
          onContextReady={(ctx) => {
            capturedCtx = ctx;
          }}
        />
      </SpotifyPlayerProvider>
    );

    await act(async () => {
      await capturedCtx.next();
    });
    expect(capturedCtx.errorMessage).toBe('Temporary playback error');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    expect(capturedCtx.errorMessage).toBeNull();
  });
});
