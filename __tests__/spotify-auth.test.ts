import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';
import { SPOTIFY_CONFIG } from '@/constants/Config';
import {
  clearTokens,
  completeAuthWithUrl,
  getCachedSpotifyProfile,
  getValidAccessToken,
  hasRecentlyPlayedScope,
  refreshAccessToken,
  saveCachedSpotifyProfile,
} from '@/services/spotify/auth';

const mockSecureStoreMemory = new Map<string, string>();

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStoreMemory.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreMemory.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreMemory.delete(key);
  }),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  getRandomValues: jest.fn((arr: Uint8Array) => arr.fill(42)),
  digestStringAsync: jest.fn(async () => 'mockDigest'),
}));

jest.mock('expo-linking', () => ({
  parse: jest.fn(() => ({ queryParams: {} })),
}));

jest.mock('expo-auth-session', () => ({
  getDefaultReturnUrl: jest.fn(() => 'walkthetalk://auth'),
}));

describe('services/spotify/auth', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    await clearTokens();
    mockSecureStoreMemory.clear();
    jest.clearAllMocks();
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('deduplicates concurrent refreshAccessToken calls using a single-flight mutex', async () => {
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.accessToken, 'old-access');
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.refreshToken, 'refresh-1');

    let resolveFetch!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = refreshAccessToken();
    const p2 = refreshAccessToken();

    // Flush SecureStore read microtask before fetch fires
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'refresh-2',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'user-read-playback-state',
      }),
    } as Response);

    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('new-access');
    expect(t2).toBe('new-access');
    expect(mockSecureStoreMemory.get(SPOTIFY_CONFIG.storageKeys.accessToken)).toBe('new-access');
    expect(mockSecureStoreMemory.get(SPOTIFY_CONFIG.storageKeys.refreshToken)).toBe('refresh-2');
  });

  it('preserves local tokens on transient HTTP 5xx/429 and network errors', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.accessToken, 'cached-access');
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.refreshToken, 'refresh-keep');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response);

    expect(await refreshAccessToken()).toBeNull();
    expect(mockSecureStoreMemory.get(SPOTIFY_CONFIG.storageKeys.refreshToken)).toBe('refresh-keep');
    expect(mockSecureStoreMemory.get(SPOTIFY_CONFIG.storageKeys.accessToken)).toBe('cached-access');

    fetchMock.mockRejectedValueOnce(new Error('Network offline'));
    expect(await refreshAccessToken()).toBeNull();
    expect(mockSecureStoreMemory.get(SPOTIFY_CONFIG.storageKeys.refreshToken)).toBe('refresh-keep');

    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('clears tokens when Spotify rejects refresh with HTTP 400 or 401', async () => {
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.accessToken, 'stale-access');
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.refreshToken, 'revoked-refresh');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
    } as Response);

    expect(await refreshAccessToken()).toBeNull();
    expect(mockSecureStoreMemory.has(SPOTIFY_CONFIG.storageKeys.accessToken)).toBe(false);
    expect(mockSecureStoreMemory.has(SPOTIFY_CONFIG.storageKeys.refreshToken)).toBe(false);
  });

  it('discards stale in-flight refresh result if user logs out mid-request', async () => {
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.accessToken, 'access-a');
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.refreshToken, 'refresh-a');

    let resolveFetch!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const refreshPromise = refreshAccessToken();
    await Promise.resolve();
    await Promise.resolve();

    // User logs out while refresh HTTP request is still in-flight
    await clearTokens();

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'zombie-access',
        refresh_token: 'zombie-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'user-read-playback-state',
      }),
    } as Response);

    expect(await refreshPromise).toBeNull();
    expect(mockSecureStoreMemory.has(SPOTIFY_CONFIG.storageKeys.accessToken)).toBe(false);
  });

  it('serves unexpired token from in-memory cache without re-reading SecureStore and refreshes when expired', async () => {
    const baseNow = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseNow);
    const futureExpiry = (baseNow + 300_000).toString();
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.accessToken, 'valid-access');
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.refreshToken, 'valid-refresh');
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.expiresAt, futureExpiry);

    expect(await getValidAccessToken()).toBe('valid-access');
    const callsAfterFirstRead = (SecureStore.getItemAsync as jest.Mock).mock.calls.length;

    // Second call uses in-memory cache (0 additional SecureStore reads)
    expect(await getValidAccessToken()).toBe('valid-access');
    expect((SecureStore.getItemAsync as jest.Mock).mock.calls.length).toBe(callsAfterFirstRead);
    expect(fetchMock).not.toHaveBeenCalled();

    // Advance clock past expiry
    nowSpy.mockReturnValue(baseNow + 301_000);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'refreshed-access',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'user-read-playback-state',
      }),
    } as Response);

    expect(await getValidAccessToken()).toBe('refreshed-access');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates OAuth state in callback URLs and caches userProfile offline', async () => {
    mockSecureStoreMemory.set('spotify_pkce_verifier', 'verifier-123');
    mockSecureStoreMemory.set('spotify_pkce_state', 'expected-state');

    await expect(
      completeAuthWithUrl('walkthetalk://callback?code=auth-code&state=wrong-state')
    ).rejects.toThrow(/state/i);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'manual-access',
        refresh_token: 'manual-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'user-read-private',
      }),
    } as Response);

    await expect(
      completeAuthWithUrl('walkthetalk://callback?code=auth-code&state=expected-state')
    ).resolves.toBe(true);
    expect(mockSecureStoreMemory.has('spotify_pkce_state')).toBe(false);

    await saveCachedSpotifyProfile({
      id: 'u1',
      display_name: 'Runner',
      product: 'premium',
      uri: 'spotify:user:u1',
    });
    expect(await getCachedSpotifyProfile()).toMatchObject({
      id: 'u1',
      product: 'premium',
    });

    await clearTokens();
    expect(await getCachedSpotifyProfile()).toBeNull();
  });

  it('tracks granted recently-played scope and clears it on logout', async () => {
    expect(await hasRecentlyPlayedScope()).toBe(false);

    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.accessToken, 'expired-access');
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.refreshToken, 'valid-refresh');
    mockSecureStoreMemory.set(
      SPOTIFY_CONFIG.storageKeys.expiresAt,
      (Date.now() - 1000).toString()
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'scoped-access',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'user-read-playback-state user-read-recently-played',
      }),
    } as Response);

    await getValidAccessToken();
    expect(await hasRecentlyPlayedScope()).toBe(true);

    await clearTokens();
    expect(await hasRecentlyPlayedScope()).toBe(false);
  });
});
