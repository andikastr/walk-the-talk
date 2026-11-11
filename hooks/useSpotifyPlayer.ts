import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSpotifyPlayerContext } from '@/context/SpotifyPlayerContext';

export function useSpotifyPlayer() {
  return useSpotifyPlayerContext();
}

/**
 * Mendaftarkan layar yang menampilkan kontrol Spotify sebagai consumer aktif
 * sehingga polling hanya berjalan saat layar tersebut berada dalam fokus.
 */
export function useSpotifyPlayerFocus(): void {
  const { registerPollingConsumer } = useSpotifyPlayerContext();

  useFocusEffect(
    useCallback(() => {
      return registerPollingConsumer();
    }, [registerPollingConsumer])
  );
}
