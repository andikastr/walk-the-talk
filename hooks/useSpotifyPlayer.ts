import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Linking from 'expo-linking';
import {
  getPlaybackState,
  getAvailableDevices,
  playMusic,
  pauseMusic,
  nextTrack,
  previousTrack,
  transferPlayback,
} from '@/services/spotify/player';
import { SpotifyPlaybackState, SpotifyDevice } from '@/types/spotify';
import { getActiveLanguage, getTranslations } from '@/constants/i18n';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';

export function useSpotifyPlayer() {
  const { isAuthenticated } = useSpotifyAuth();
  const [playbackState, setPlaybackState] = useState<SpotifyPlaybackState | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const fetchPlayback = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const state = await getPlaybackState();
      if (isMountedRef.current) {
        setPlaybackState(state);
        setErrorMessage(null);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        // Jangan tampilkan error berulang jika hanya 404 (tidak ada active device)
        if (err.status !== 404) {
          setErrorMessage(err.message);
        }
      }
    }
  }, [isAuthenticated]);

  const fetchDevices = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const devList = await getAvailableDevices();
      if (isMountedRef.current) {
        setDevices(devList);
      }
    } catch (err: any) {
      console.warn('Gagal memuat perangkat Spotify:', err.message);
    }
  }, [isAuthenticated]);

  // Listener AppState: begitu aplikasi kembali ke layar (foreground), langsung refresh status Spotify
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        fetchPlayback();
        fetchDevices();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [isAuthenticated, fetchPlayback, fetchDevices]);

  // Polling loop adaptif
  useEffect(() => {
    isMountedRef.current = true;

    if (!isAuthenticated) {
      return () => {
        isMountedRef.current = false;
      };
    }

    const poll = async () => {
      await fetchPlayback();
      if (!isMountedRef.current) return;

      const intervalMs = playbackState?.is_playing ? 3000 : 8000;
      pollingTimerRef.current = setTimeout(poll, intervalMs);
    };

    const startSync = async () => {
      await Promise.all([poll(), fetchDevices()]);
    };

    startSync();

    return () => {
      isMountedRef.current = false;
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, [isAuthenticated, fetchPlayback, fetchDevices, playbackState?.is_playing]);

  const effectivePlaybackState = isAuthenticated ? playbackState : null;
  const effectiveDevices = isAuthenticated ? devices : [];
  const effectiveErrorMessage = isAuthenticated ? errorMessage : null;

  const handleTogglePlay = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      if (playbackState?.is_playing) {
        await pauseMusic();
        setPlaybackState((prev) => (prev ? { ...prev, is_playing: false } : null));
      } else {
        // Cari perangkat target otomatis jika belum ada yang aktif
        let targetDeviceId = playbackState?.device?.id;
        if (!targetDeviceId) {
          const devList = devices.length > 0 ? devices : await getAvailableDevices();
          const target =
            devList.find((d) => d.is_active) ||
            devList.find((d) => d.type === 'Smartphone') ||
            devList[0];
          targetDeviceId = target?.id;
        }

        if (targetDeviceId) {
          await playMusic({ deviceId: targetDeviceId });
        } else {
          await playMusic();
        }
        setPlaybackState((prev) => (prev ? { ...prev, is_playing: true } : null));
      }
      setTimeout(fetchPlayback, 600);
    } catch (err: any) {
      const errors = getTranslations(getActiveLanguage()).spotifyErrors;
      if (err.message?.includes('404') || err.message?.includes('NO_ACTIVE_DEVICE')) {
        setErrorMessage(errors.noActiveDeviceInline);
      } else {
        setErrorMessage(err.message || errors.togglePlayFailed);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      await nextTrack();
      setTimeout(fetchPlayback, 800);
    } catch (err: any) {
      setErrorMessage(err.message || getTranslations(getActiveLanguage()).spotifyErrors.nextFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevious = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      await previousTrack();
      setTimeout(fetchPlayback, 800);
    } catch (err: any) {
      setErrorMessage(err.message || getTranslations(getActiveLanguage()).spotifyErrors.prevFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDevice = async (deviceId: string) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      await transferPlayback(deviceId, true);
      setTimeout(() => {
        fetchPlayback();
        fetchDevices();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(
        err.message || getTranslations(getActiveLanguage()).spotifyErrors.transferFailed
      );
    } finally {
      setIsLoading(false);
    }
  };

  const wakeUpSpotify = async (): Promise<boolean> => {
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
  };

  return {
    playbackState: effectivePlaybackState,
    currentTrack: effectivePlaybackState?.item || null,
    isPlaying: effectivePlaybackState?.is_playing ?? false,
    activeDevice:
      effectivePlaybackState?.device || effectiveDevices.find((d) => d.is_active) || null,
    devices: effectiveDevices,
    isLoading,
    errorMessage: effectiveErrorMessage,
    togglePlay: handleTogglePlay,
    next: handleNext,
    previous: handlePrevious,
    refreshPlayback: fetchPlayback,
    refreshDevices: fetchDevices,
    selectDevice: handleSelectDevice,
    wakeUpSpotify,
  };
}

