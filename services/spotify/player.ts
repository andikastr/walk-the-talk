import { spotifyFetch } from './client';
import { toWorkoutSoundtrackItem } from './workout-soundtrack';
import {
  SpotifyPlaybackState,
  SpotifyDevice,
  SpotifyUser,
  SpotifyPlaylist,
  SpotifyTrack,
} from '@/types/spotify';
import type { WorkoutSoundtrackItem } from '@/types/workout';

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

interface RecentlyPlayedItemPayload {
  track?: SpotifyTrack | null;
  played_at?: string;
}

export interface RecentlyPlayedResult {
  items: WorkoutSoundtrackItem[];
  missingScope: boolean;
}

/**
 * Mengambil riwayat lagu yang baru selesai diputar (termasuk saat app di background / layar mati).
 * Endpoint: GET /v1/me/player/recently-played
 * Memerlukan scope `user-read-recently-played`; mengembalikan `missingScope: true` pada HTTP 403
 * agar token lama tanpa scope tetap fallback mulus tanpa memblokir simpan workout.
 */
export async function getRecentlyPlayedTracks(options?: {
  afterMs?: number;
  limit?: number;
}): Promise<RecentlyPlayedResult> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 50);
  const query = new URLSearchParams({ limit: String(limit) });
  if (typeof options?.afterMs === 'number' && Number.isFinite(options.afterMs)) {
    query.set('after', String(Math.max(0, Math.floor(options.afterMs))));
  }

  try {
    const res = await spotifyFetch<{ items?: RecentlyPlayedItemPayload[] }>(
      `/me/player/recently-played?${query.toString()}`
    );
    const items = (res.items || [])
      .map((entry) => {
        const parsedAt = entry.played_at ? Date.parse(entry.played_at) : NaN;
        const playedAt = Number.isFinite(parsedAt) ? parsedAt : undefined;
        return toWorkoutSoundtrackItem(entry.track, playedAt);
      })
      .filter((item): item is WorkoutSoundtrackItem => item !== null)
      .sort((a, b) => (a.playedAt ?? 0) - (b.playedAt ?? 0));

    return { items, missingScope: false };
  } catch (err: any) {
    if (err?.status === 403) {
      return { items: [], missingScope: true };
    }
    console.warn('Gagal mengambil recently played Spotify:', err?.message || err);
    return { items: [], missingScope: false };
  }
}

