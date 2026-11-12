import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Linking from 'expo-linking';
import {
  getAvailableDevices,
  getPlaybackState,
  nextTrack,
  pauseMusic,
  pickPreferredDevice,
  playWithDeviceRecovery,
  previousTrack,
  transferPlayback,
} from '@/services/spotify/player';
import {
  SpotifyDevice,
  SpotifyPlayableItem,
  SpotifyPlaybackState,
} from '@/types/spotify';
import { getActiveLanguage, getTranslations } from '@/constants/i18n';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';

interface SpotifyPlayerContextValue {
  playbackState: SpotifyPlaybackState | null;
  currentTrack: SpotifyPlayableItem | null;
  isPlaying: boolean;
  activeDevice: SpotifyDevice | null;
  devices: SpotifyDevice[];
  isLoading: boolean;
  errorMessage: string | null;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  refreshPlayback: () => Promise<void>;
  refreshDevices: () => Promise<SpotifyDevice[]>;
  selectDevice: (deviceId: string) => Promise<void>;
  wakeUpSpotify: () => Promise<boolean>;
  registerPollingConsumer: () => () => void;
}

const SpotifyPlayerContext = createContext<SpotifyPlayerContextValue | null>(null);

const ACTIVE_POLL_INTERVAL_MS = 3000;
const IDLE_POLL_INTERVAL_MS = 8000;
const PLAYBACK_FETCH_COOLDOWN_MS = 1200;
const ERROR_AUTO_DISMISS_MS = 5000;
const EMPTY_DEVICES: SpotifyDevice[] = [];

export function SpotifyPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useSpotifyAuth();
  const [playbackState, setPlaybackState] = useState<SpotifyPlaybackState | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isAuthenticatedRef = useRef<boolean>(isAuthenticated);
  const isPlayingRef = useRef<boolean>(false);
  const appStateRef = useRef<string>(AppState.currentState || 'active');
  const playbackStateRef = useRef<SpotifyPlaybackState | null>(null);
  const devicesRef = useRef<SpotifyDevice[]>([]);
  const activeConsumerCountRef = useRef<number>(0);
  const playbackFetchInFlightRef = useRef<Promise<void> | null>(null);
  const lastPlaybackFetchAtRef = useRef<number>(0);
  const scheduleNextPollRef = useRef<() => void>(() => {});

  const clearBannerError = useCallback(() => {
    if (errorDismissTimerRef.current) {
      clearTimeout(errorDismissTimerRef.current);
      errorDismissTimerRef.current = null;
    }
    setErrorMessage(null);
  }, []);

  const showBannerError = useCallback((message: string) => {
    if (errorDismissTimerRef.current) {
      clearTimeout(errorDismissTimerRef.current);
    }
    setErrorMessage(message);
    errorDismissTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setErrorMessage(null);
      }
      errorDismissTimerRef.current = null;
    }, ERROR_AUTO_DISMISS_MS);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const fetchPlayback = useCallback(async (force: boolean = false): Promise<void> => {
    if (!isAuthenticatedRef.current) return;
    if (playbackFetchInFlightRef.current) {
      return playbackFetchInFlightRef.current;
    }
    if (!force && Date.now() - lastPlaybackFetchAtRef.current < PLAYBACK_FETCH_COOLDOWN_MS) {
      return;
    }

    const request = (async () => {
      lastPlaybackFetchAtRef.current = Date.now();
      try {
        const state = await getPlaybackState();
        if (isMountedRef.current && isAuthenticatedRef.current) {
          playbackStateRef.current = state;
          isPlayingRef.current = Boolean(state?.is_playing);
          setPlaybackState(state);
          clearBannerError();
        }
      } catch (err: any) {
        if (isMountedRef.current && isAuthenticatedRef.current) {
          // Jangan tampilkan error berulang jika hanya 404 (tidak ada active device)
          if (err.status !== 404) {
            showBannerError(err.message);
          }
        }
      } finally {
        playbackFetchInFlightRef.current = null;
      }
    })();

    playbackFetchInFlightRef.current = request;
    return request;
  }, [clearBannerError, showBannerError]);

  const forceRefreshPlayback = useCallback(() => fetchPlayback(true), [fetchPlayback]);

  const fetchDevices = useCallback(async (): Promise<SpotifyDevice[]> => {
    if (!isAuthenticatedRef.current) return EMPTY_DEVICES;
    try {
      const devList = await getAvailableDevices();
      if (isMountedRef.current && isAuthenticatedRef.current) {
        devicesRef.current = devList;
        setDevices(devList);
      }
      return devList;
    } catch (err: any) {
      console.warn('Gagal memuat perangkat Spotify:', err.message);
      return devicesRef.current;
    }
  }, []);

  const scheduleNextPoll = useCallback(() => {
    stopPolling();
    if (
      !isMountedRef.current ||
      !isAuthenticatedRef.current ||
      appStateRef.current !== 'active' ||
      activeConsumerCountRef.current <= 0
    ) {
      return;
    }
    const intervalMs = isPlayingRef.current
      ? ACTIVE_POLL_INTERVAL_MS
      : IDLE_POLL_INTERVAL_MS;
    pollingTimerRef.current = setTimeout(async () => {
      if (
        !isMountedRef.current ||
        !isAuthenticatedRef.current ||
        appStateRef.current !== 'active' ||
        activeConsumerCountRef.current <= 0
      ) {
        return;
      }
      await fetchPlayback(false);
      scheduleNextPollRef.current();
    }, intervalMs);
  }, [fetchPlayback, stopPolling]);

  useEffect(() => {
    scheduleNextPollRef.current = scheduleNextPoll;
  }, [scheduleNextPoll]);

  const registerPollingConsumer = useCallback(() => {
    activeConsumerCountRef.current += 1;
    if (
      activeConsumerCountRef.current === 1 &&
      isMountedRef.current &&
      isAuthenticatedRef.current &&
      appStateRef.current === 'active'
    ) {
      void fetchPlayback(false).then(() => {
        if (
          isMountedRef.current &&
          isAuthenticatedRef.current &&
          appStateRef.current === 'active' &&
          activeConsumerCountRef.current > 0
        ) {
          scheduleNextPollRef.current();
        }
      });
    }

    return () => {
      activeConsumerCountRef.current = Math.max(0, activeConsumerCountRef.current - 1);
      if (activeConsumerCountRef.current === 0) {
        stopPolling();
      }
    };
  }, [fetchPlayback, stopPolling]);

  const scheduleDelayedPlaybackRefresh = useCallback(
    (delayMs: number) => {
      if (actionRefreshTimerRef.current) {
        clearTimeout(actionRefreshTimerRef.current);
      }
      actionRefreshTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && isAuthenticatedRef.current) {
          void fetchPlayback(true).then(() => {
            if (activeConsumerCountRef.current > 0) {
              scheduleNextPollRef.current();
            }
          });
        }
      }, delayMs);
    },
    [fetchPlayback]
  );

  // Satu loop polling global & satu listener AppState untuk seluruh aplikasi
  useEffect(() => {
    isMountedRef.current = true;
    isAuthenticatedRef.current = isAuthenticated;

    if (!isAuthenticated) {
      stopPolling();
      isPlayingRef.current = false;
      playbackStateRef.current = null;
      devicesRef.current = [];
      playbackFetchInFlightRef.current = null;
      lastPlaybackFetchAtRef.current = 0;
      const clearTimer = setTimeout(() => {
        setPlaybackState(null);
        setDevices(EMPTY_DEVICES);
        clearBannerError();
      }, 0);
      return () => {
        clearTimeout(clearTimer);
        isMountedRef.current = false;
        stopPolling();
        if (actionRefreshTimerRef.current) {
          clearTimeout(actionRefreshTimerRef.current);
          actionRefreshTimerRef.current = null;
        }
        if (errorDismissTimerRef.current) {
          clearTimeout(errorDismissTimerRef.current);
          errorDismissTimerRef.current = null;
        }
      };
    }

    const syncNow = async () => {
      if (appStateRef.current === 'active' && activeConsumerCountRef.current > 0) {
        await fetchPlayback(false);
        scheduleNextPoll();
      }
    };

    void syncNow();

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active' && prevState !== 'active') {
        if (isAuthenticatedRef.current && activeConsumerCountRef.current > 0) {
          void fetchPlayback(false).then(() => {
            if (
              isMountedRef.current &&
              isAuthenticatedRef.current &&
              appStateRef.current === 'active' &&
              activeConsumerCountRef.current > 0
            ) {
              scheduleNextPoll();
            }
          });
        }
      } else if (nextState !== 'active') {
        stopPolling();
      }
    });

    return () => {
      isMountedRef.current = false;
      sub.remove();
      stopPolling();
      if (actionRefreshTimerRef.current) {
        clearTimeout(actionRefreshTimerRef.current);
        actionRefreshTimerRef.current = null;
      }
      if (errorDismissTimerRef.current) {
        clearTimeout(errorDismissTimerRef.current);
        errorDismissTimerRef.current = null;
      }
    };
  }, [clearBannerError, fetchPlayback, isAuthenticated, scheduleNextPoll, stopPolling]);

  const handleTogglePlay = useCallback(async () => {
    try {
      setIsLoading(true);
      clearBannerError();
      const current = playbackStateRef.current;
      if (current?.is_playing) {
        await pauseMusic();
        isPlayingRef.current = false;
        setPlaybackState((prev) => {
          const next = prev ? { ...prev, is_playing: false } : null;
          playbackStateRef.current = next;
          return next;
        });
      } else {
        let targetDeviceId = current?.device?.id ?? undefined;
        if (!targetDeviceId) {
          const cachedDevices = devicesRef.current;
          const devList =
            cachedDevices.length > 0 ? cachedDevices : await fetchDevices();
          targetDeviceId = pickPreferredDevice(devList)?.id ?? undefined;
        }

        await playWithDeviceRecovery({
          deviceId: targetDeviceId,
          refreshDevices: fetchDevices,
        });

        isPlayingRef.current = true;
        setPlaybackState((prev) => {
          const next = prev ? { ...prev, is_playing: true } : null;
          playbackStateRef.current = next;
          return next;
        });
      }
      scheduleDelayedPlaybackRefresh(600);
    } catch (err: any) {
      const errors = getTranslations(getActiveLanguage()).spotifyErrors;
      if (
        err?.status === 404 ||
        err.message?.includes('404') ||
        err.message?.includes('NO_ACTIVE_DEVICE')
      ) {
        showBannerError(errors.noActiveDeviceInline);
        void fetchDevices();
      } else {
        showBannerError(err.message || errors.togglePlayFailed);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [clearBannerError, fetchDevices, scheduleDelayedPlaybackRefresh, showBannerError]);

  const handleNext = useCallback(async () => {
    try {
      setIsLoading(true);
      clearBannerError();
      await nextTrack();
      scheduleDelayedPlaybackRefresh(800);
    } catch (err: any) {
      showBannerError(
        err.message || getTranslations(getActiveLanguage()).spotifyErrors.nextFailed
      );
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [clearBannerError, scheduleDelayedPlaybackRefresh, showBannerError]);

  const handlePrevious = useCallback(async () => {
    try {
      setIsLoading(true);
      clearBannerError();
      await previousTrack();
      scheduleDelayedPlaybackRefresh(800);
    } catch (err: any) {
      showBannerError(
        err.message || getTranslations(getActiveLanguage()).spotifyErrors.prevFailed
      );
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [clearBannerError, scheduleDelayedPlaybackRefresh, showBannerError]);

  const handleSelectDevice = useCallback(
    async (deviceId: string) => {
      try {
        setIsLoading(true);
        clearBannerError();
        await transferPlayback(deviceId, true);
        if (actionRefreshTimerRef.current) {
          clearTimeout(actionRefreshTimerRef.current);
        }
        actionRefreshTimerRef.current = setTimeout(() => {
          if (isMountedRef.current && isAuthenticatedRef.current) {
            void fetchPlayback(true).then(() => {
              if (activeConsumerCountRef.current > 0) {
                scheduleNextPollRef.current();
              }
            });
            void fetchDevices();
          }
        }, 1000);
      } catch (err: any) {
        showBannerError(
          err.message || getTranslations(getActiveLanguage()).spotifyErrors.transferFailed
        );
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [clearBannerError, fetchDevices, fetchPlayback, showBannerError]
  );

  const wakeUpSpotify = useCallback(async (): Promise<boolean> => {
    try {
      const canOpen = await Linking.canOpenURL('spotify:');
      if (canOpen) {
        await Linking.openURL('spotify:');
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Gagal membuka Spotify:', err);
      return false;
    }
  }, []);

  const effectivePlaybackState = isAuthenticated ? playbackState : null;
  const effectiveDevices = isAuthenticated ? devices : EMPTY_DEVICES;
  const effectiveErrorMessage = isAuthenticated ? errorMessage : null;

  const value = useMemo<SpotifyPlayerContextValue>(
    () => ({
      playbackState: effectivePlaybackState,
      currentTrack: effectivePlaybackState?.item || null,
      isPlaying: effectivePlaybackState?.is_playing ?? false,
      activeDevice:
        effectivePlaybackState?.device ||
        effectiveDevices.find((d) => d.is_active) ||
        null,
      devices: effectiveDevices,
      isLoading,
      errorMessage: effectiveErrorMessage,
      togglePlay: handleTogglePlay,
      next: handleNext,
      previous: handlePrevious,
      refreshPlayback: forceRefreshPlayback,
      refreshDevices: fetchDevices,
      selectDevice: handleSelectDevice,
      wakeUpSpotify,
      registerPollingConsumer,
    }),
    [
      effectiveDevices,
      effectiveErrorMessage,
      effectivePlaybackState,
      fetchDevices,
      forceRefreshPlayback,
      handleNext,
      handlePrevious,
      handleSelectDevice,
      handleTogglePlay,
      isLoading,
      registerPollingConsumer,
      wakeUpSpotify,
    ]
  );

  return (
    <SpotifyPlayerContext.Provider value={value}>
      {children}
    </SpotifyPlayerContext.Provider>
  );
}

export function useSpotifyPlayerContext(): SpotifyPlayerContextValue {
  const ctx = useContext(SpotifyPlayerContext);
  if (!ctx) {
    throw new Error('useSpotifyPlayer must be used inside SpotifyPlayerProvider');
  }
  return ctx;
}
