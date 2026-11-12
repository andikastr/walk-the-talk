import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { spotifyFetch, SpotifyApiError } from '@/services/spotify/client';
import {
  getPlaylistItems,
  nextTrack,
  pauseMusic,
  playWithDeviceRecovery,
  resolveSpotifyMediaMeta,
} from '@/services/spotify/player';

jest.mock('@/services/spotify/auth', () => ({
  getValidAccessToken: jest.fn(async () => 'mock_access_token'),
  refreshAccessToken: jest.fn(async () => null),
}));

function makeMockResponse(params: {
  status: number;
  ok?: boolean;
  bodyText?: string;
}): Response {
  const { status, ok = status >= 200 && status < 300, bodyText = '' } = params;
  return {
    status,
    ok,
    headers: {
      get: () => null,
    },
    text: jest.fn(async () => bodyText),
    json: jest.fn(async () => {
      throw new Error('response.json() should not be called directly');
    }),
  } as unknown as Response;
}

describe('services/spotify/client & player', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('handles 204 No Content and 200 OK empty body on playback controls without JSON parse error', async () => {
    fetchMock.mockResolvedValueOnce(makeMockResponse({ status: 204 }));
    await expect(pauseMusic('dev 1')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toContain('/me/player/pause?device_id=dev%201');

    fetchMock.mockResolvedValueOnce(makeMockResponse({ status: 200, bodyText: '' }));
    await expect(pauseMusic()).resolves.toBeUndefined();
  });

  it('handles 200 OK non-JSON text on POST/PUT playback controls cleanly', async () => {
    fetchMock.mockResolvedValueOnce(
      makeMockResponse({ status: 200, bodyText: 'snapshot_ack_token' })
    );
    await expect(nextTrack()).resolves.toBeUndefined();
  });

  it('throws SyntaxError when GET returns corrupt non-JSON payload', async () => {
    fetchMock.mockResolvedValueOnce(
      makeMockResponse({ status: 200, bodyText: '<html>captive</html>' })
    );
    await expect(spotifyFetch('/me/player')).rejects.toThrow(SpotifyApiError);
  });

  it('reads non-JSON error body once without stream already-read failures', async () => {
    fetchMock.mockResolvedValueOnce(
      makeMockResponse({ status: 502, ok: false, bodyText: 'Bad Gateway' })
    );
    await expect(spotifyFetch('/me')).rejects.toMatchObject({
      status: 502,
      message: 'Bad Gateway',
    });
  });

  it('extracts both Spotify Feb-2026 item and legacy track payloads in getPlaylistItems', async () => {
    fetchMock.mockResolvedValueOnce(
      makeMockResponse({
        status: 200,
        bodyText: JSON.stringify({
          items: [
            {
              item: {
                id: 't1',
                name: 'New Format Song',
                duration_ms: 180000,
                uri: 'spotify:track:t1',
                artists: [{ id: 'a1', name: 'Artist 1', uri: 'spotify:artist:a1' }],
                album: { id: 'al1', name: 'Album 1', images: [], uri: 'spotify:album:al1' },
              },
            },
            {
              track: {
                id: 't2',
                name: 'Legacy Format Song',
                duration_ms: 200000,
                uri: 'spotify:track:t2',
                artists: [{ id: 'a2', name: 'Artist 2', uri: 'spotify:artist:a2' }],
                album: { id: 'al2', name: 'Album 2', images: [], uri: 'spotify:album:al2' },
              },
            },
            {
              item: {
                id: 'ep1',
                name: 'Podcast Episode Without Artists',
              },
            },
          ],
        }),
      })
    );

    const tracks = await getPlaylistItems('pl_1');
    expect(tracks.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('maps AbortError timeouts to SpotifyApiError(408)', async () => {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortErr);

    await expect(spotifyFetch('/me')).rejects.toMatchObject({
      status: 408,
    });
  });

  it('recovers from stale 404 device error in playWithDeviceRecovery and resolves episode metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      makeMockResponse({
        status: 404,
        ok: false,
        bodyText: JSON.stringify({ error: { status: 404, message: 'Device not found' } }),
      })
    );
    fetchMock.mockResolvedValueOnce(makeMockResponse({ status: 204 }));

    const refreshDevices = jest.fn(async () => [
      {
        id: 'fresh_phone',
        is_active: true,
        is_private_session: false,
        is_restricted: false,
        name: 'Phone',
        type: 'Smartphone',
        volume_percent: 70,
        supports_volume: true,
      },
    ]);

    await expect(
      playWithDeviceRecovery({ deviceId: 'stale_dev', refreshDevices })
    ).resolves.toBeUndefined();
    expect(refreshDevices).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1][0]).toContain('device_id=fresh_phone');

    expect(
      resolveSpotifyMediaMeta({
        id: 'ep_1',
        name: 'Morning Run Pod',
        duration_ms: 120_000,
        uri: 'spotify:episode:ep_1',
        images: [{ url: 'https://img/pod.jpg', height: 300, width: 300 }],
        show: { name: 'Runner Show' },
      })
    ).toEqual({
      title: 'Morning Run Pod',
      subtitle: 'Runner Show',
      artworkUrl: 'https://img/pod.jpg',
    });
  });
});

