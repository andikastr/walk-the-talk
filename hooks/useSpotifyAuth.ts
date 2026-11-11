import { useSpotifyAuthContext } from '@/context/SpotifyAuthContext';

export function useSpotifyAuth() {
  return useSpotifyAuthContext();
}
