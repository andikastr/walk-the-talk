import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SPOTIFY_CONFIG } from '@/constants/Config';
import {
  clearTokens,
  getValidAccessToken,
  hasRecentlyPlayedScope,
  refreshAccessToken,
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

  beforeEach(() => {
    mockSecureStoreMemory.clear();
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

  it('returns cached valid token without network call and refreshes expired tokens', async () => {
    const futureExpiry = (Date.now() + 300_000).toString();
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.accessToken, 'valid-access');
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.refreshToken, 'valid-refresh');
    mockSecureStoreMemory.set(SPOTIFY_CONFIG.storageKeys.expiresAt, futureExpiry);

    expect(await getValidAccessToken()).toBe('valid-access');
    expect(fetchMock).not.toHaveBeenCalled();

    // Now expire the token
    mockSecureStoreMemory.set(
      SPOTIFY_CONFIG.storageKeys.expiresAt,
      (Date.now() - 1000).toString()
    );
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
