import { spotifyFetch } from './client';
import {
  SpotifyPlaybackState,
  SpotifyDevice,
  SpotifyUser,
  SpotifyPlaylist,
  SpotifyTrack,
} from '@/types/spotify';

/**
 * Mengambil profil pengguna yang sedang login
 * Endpoint: GET /v1/me
 */
export async function getCurrentUser(): Promise<SpotifyUser> {
  return spotifyFetch<SpotifyUser>('/me');
}

/**
 * Mengambil status pemutaran musik saat ini
 * Endpoint: GET /v1/me/player
 */
export async function getPlaybackState(): Promise<SpotifyPlaybackState | null> {
  try {
    const res = await spotifyFetch<SpotifyPlaybackState>('/me/player');
    // Jika tidak ada konten atau tidak ada item/device, kembalikan null
    if (!res || !res.device) return null;
    return res;
  } catch (err: any) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Mengambil daftar perangkat Spotify Connect yang tersedia
 * Endpoint: GET /v1/me/player/devices
 */
export async function getAvailableDevices(): Promise<SpotifyDevice[]> {
  const res = await spotifyFetch<{ devices: SpotifyDevice[] }>('/me/player/devices');
  return res.devices || [];
}

/**
 * Memindahkan pemutaran ke perangkat tertentu
 * Endpoint: PUT /v1/me/player
 */
export async function transferPlayback(deviceId: string, play: boolean = true): Promise<void> {
  await spotifyFetch<void>('/me/player', {
    method: 'PUT',
    body: JSON.stringify({
      device_ids: [deviceId],
      play,
    }),
  });
}

/**
 * Memutar musik (Resume atau Putar track/playlist baru)
 * Endpoint: PUT /v1/me/player/play
 */
export async function playMusic(params?: {
  deviceId?: string;
  contextUri?: string;
  uris?: string[];
}): Promise<void> {
  let endpoint = '/me/player/play';
  if (params?.deviceId) {
    endpoint += `?device_id=${params.deviceId}`;
  }

  const body: Record<string, any> = {};
  if (params?.contextUri) {
    body.context_uri = params.contextUri;
  } else if (params?.uris && params.uris.length > 0) {
    body.uris = params.uris;
  }

  await spotifyFetch<void>(endpoint, {
    method: 'PUT',
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}

/**
 * Menjeda pemutaran musik
 * Endpoint: PUT /v1/me/player/pause
 */
export async function pauseMusic(deviceId?: string): Promise<void> {
  let endpoint = '/me/player/pause';
  if (deviceId) {
    endpoint += `?device_id=${deviceId}`;
  }

  await spotifyFetch<void>(endpoint, {
    method: 'PUT',
  });
}

/**
 * Memutar lagu berikutnya
 * Endpoint: POST /v1/me/player/next
 */
export async function nextTrack(deviceId?: string): Promise<void> {
  let endpoint = '/me/player/next';
  if (deviceId) {
    endpoint += `?device_id=${deviceId}`;
  }

  await spotifyFetch<void>(endpoint, {
    method: 'POST',
  });
}

/**
 * Mengulang atau memutar lagu sebelumnya
 * Endpoint: POST /v1/me/player/previous
 */
export async function previousTrack(deviceId?: string): Promise<void> {
  let endpoint = '/me/player/previous';
  if (deviceId) {
    endpoint += `?device_id=${deviceId}`;
  }

  await spotifyFetch<void>(endpoint, {
    method: 'POST',
  });
}

/**
 * Mengambil daftar playlist pengguna
 * Endpoint: GET /v1/me/playlists
 */
export async function getUserPlaylists(limit: number = 20): Promise<SpotifyPlaylist[]> {
  const res = await spotifyFetch<{ items: SpotifyPlaylist[] }>(`/me/playlists?limit=${limit}`);
  return res.items || [];
}

/**
 * Mengambil item/lagu dari playlist menggunakan endpoint modern yang direkomendasikan
 * Endpoint: GET /v1/playlists/{playlist_id}/items (BUKAN /tracks yang sudah deprecated)
 */
export async function getPlaylistItems(playlistId: string, limit: number = 20): Promise<SpotifyTrack[]> {
  const res = await spotifyFetch<{ items: { track: SpotifyTrack | null }[] }>(
    `/playlists/${playlistId}/items?limit=${limit}`
  );
  return (res.items || []).map((item) => item.track).filter((t): t is SpotifyTrack => t !== null);
}

