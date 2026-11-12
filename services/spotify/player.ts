import { spotifyFetch } from './client';
import { toWorkoutSoundtrackItem } from './workout-soundtrack';
import {
  SpotifyPlaybackState,
  SpotifyPlayableItem,
  SpotifyDevice,
  SpotifyUser,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyEpisode,
} from '@/types/spotify';
import type { WorkoutSoundtrackItem } from '@/types/workout';

function withDeviceId(endpoint: string, deviceId?: string): string {
  if (!deviceId) return endpoint;
  return `${endpoint}?device_id=${encodeURIComponent(deviceId)}`;
}

/**
 * Selects the best available Spotify Connect playback target (active first, then smartphone, then first).
 */
export function pickPreferredDevice(devices: SpotifyDevice[]): SpotifyDevice | null {
  if (!devices || devices.length === 0) return null;
  return (
    devices.find((d) => d.is_active) ||
    devices.find((d) => d.type === 'Smartphone') ||
    devices[0] ||
    null
  );
}

/**
 * Normalizes display metadata for both music tracks and podcast episodes.
 */
export function resolveSpotifyMediaMeta(
  item: SpotifyPlayableItem | null | undefined,
  fallbackSubtitle: string = ''
): { title: string; subtitle: string; artworkUrl?: string } {
  if (!item) {
    return { title: '', subtitle: fallbackSubtitle };
  }

  const maybeTrack = item as Partial<SpotifyTrack>;
  if (Array.isArray(maybeTrack.artists) && maybeTrack.artists.length > 0) {
    const artists = maybeTrack.artists
      .map((a) => a?.name?.trim())
      .filter(Boolean)
      .join(', ');
    return {
      title: item.name,
      subtitle: artists || fallbackSubtitle,
      artworkUrl: maybeTrack.album?.images?.[0]?.url,
    };
  }

  const maybeEpisode = item as Partial<SpotifyEpisode>;
  return {
    title: item.name,
    subtitle: maybeEpisode.show?.name?.trim() || fallbackSubtitle,
    artworkUrl: maybeEpisode.images?.[0]?.url,
  };
}

/**
 * Mengambil profil pengguna yang sedang login
 * Endpoint: GET /v1/me
 */
export async function getCurrentUser(): Promise<SpotifyUser> {
  return spotifyFetch<SpotifyUser>('/me');
}

/**
 * Mengambil status pemutaran musik saat ini (termasuk track dan episode podcast)
 * Endpoint: GET /v1/me/player?additional_types=track,episode
 */
export async function getPlaybackState(): Promise<SpotifyPlaybackState | null> {
  try {
    const res = await spotifyFetch<SpotifyPlaybackState>(
      '/me/player?additional_types=track,episode'
    );
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
  const endpoint = withDeviceId('/me/player/play', params?.deviceId);

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

export async function playWithDeviceRecovery(params: {
  deviceId?: string;
  contextUri?: string;
  uris?: string[];
  refreshDevices: () => Promise<SpotifyDevice[]>;
}): Promise<void> {
  try {
    await playMusic({
      deviceId: params.deviceId,
      contextUri: params.contextUri,
      uris: params.uris,
    });
  } catch (err: any) {
    const isMissingDevice =
      err?.status === 404 ||
      err?.message?.includes('404') ||
      err?.message?.includes('NO_ACTIVE_DEVICE');
    if (!isMissingDevice || !params.deviceId) {
      throw err;
    }

    const freshDevices = await params.refreshDevices();
    const fallbackDeviceId = pickPreferredDevice(freshDevices)?.id ?? undefined;
    if (!fallbackDeviceId || fallbackDeviceId === params.deviceId) {
      throw err;
    }

    await playMusic({
      deviceId: fallbackDeviceId,
      contextUri: params.contextUri,
      uris: params.uris,
    });
  }
}

/**
 * Menjeda pemutaran musik
 * Endpoint: PUT /v1/me/player/pause
 */
export async function pauseMusic(deviceId?: string): Promise<void> {
  await spotifyFetch<void>(withDeviceId('/me/player/pause', deviceId), {
    method: 'PUT',
  });
}

/**
 * Memutar lagu berikutnya
 * Endpoint: POST /v1/me/player/next
 */
export async function nextTrack(deviceId?: string): Promise<void> {
  await spotifyFetch<void>(withDeviceId('/me/player/next', deviceId), {
    method: 'POST',
  });
}

/**
 * Mengulang atau memutar lagu sebelumnya
 * Endpoint: POST /v1/me/player/previous
 */
export async function previousTrack(deviceId?: string): Promise<void> {
  await spotifyFetch<void>(withDeviceId('/me/player/previous', deviceId), {
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
  const res = await spotifyFetch<{
    items: { track?: SpotifyTrack | null; item?: SpotifyTrack | null }[];
  }>(`/playlists/${encodeURIComponent(playlistId)}/items?limit=${limit}`);
  return (res.items || [])
    .map((entry) => entry.item ?? entry.track ?? null)
    .filter((t): t is SpotifyTrack => t !== null && Array.isArray(t.artists));
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

