import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { getDefaultReturnUrl } from 'expo-auth-session';
import { SPOTIFY_CONFIG } from '@/constants/Config';
import { getActiveLanguage, getTranslations } from '@/constants/i18n';
import { fetchWithTimeout, isFetchTimeoutError } from './http';
import { SpotifyTokenResponse, SpotifyUser } from '@/types/spotify';

// Pastikan WebBrowser dapat menyelesaikan sesi autentikasi
WebBrowser.maybeCompleteAuthSession();

/**
 * Generate cryptographically secure random string untuk PKCE code_verifier
 */
function generateCodeVerifier(length: number = 64): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomBytes = Crypto.getRandomValues(new Uint8Array(length));
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible[randomBytes[i] % possible.length];
  }
  return text;
}

/**
 * Generate PKCE code_challenge dari code_verifier menggunakan SHA-256 & Base64URL
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );

  // Convert Base64 to Base64URL (RFC 7636)
  return digest
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Memulai alur autentikasi PKCE dengan Spotify
 */
export async function loginWithSpotify(): Promise<boolean> {
  const errors = getTranslations(getActiveLanguage()).spotifyErrors;

  if (!SPOTIFY_CONFIG.clientId) {
    throw new Error(errors.missingClientId);
  }

  const verifier = generateCodeVerifier(64);
  const state = generateCodeVerifier(32);
  const challenge = await generateCodeChallenge(verifier);

  // Simpan verifier & state di SecureStore agar dapat diverifikasi saat callback atau input manual
  await SecureStore.setItemAsync('spotify_pkce_verifier', verifier);
  await SecureStore.setItemAsync('spotify_pkce_redirect_uri', SPOTIFY_CONFIG.redirectUri);
  await SecureStore.setItemAsync('spotify_pkce_state', state);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: SPOTIFY_CONFIG.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SPOTIFY_CONFIG.scopes.join(' '),
  });

  const authUrl = `${SPOTIFY_CONFIG.authEndpoint}?${params.toString()}`;

  const isProxy = SPOTIFY_CONFIG.redirectUri.includes('auth.expo.io');
  let startUrl = authUrl;
  let returnUrl = SPOTIFY_CONFIG.redirectUri;

  if (isProxy) {
    // Di Expo Go dengan proxy auth.expo.io, sesi harus diawali di /start dengan parameter returnUrl
    // agar server proxy dapat mencatat session cookie dan me-redirect balik ke Expo Go
    returnUrl = getDefaultReturnUrl();
    const proxyParams = new URLSearchParams({
      authUrl,
      returnUrl,
    });
    const baseProxyUri = SPOTIFY_CONFIG.redirectUri.replace(/\/+$/, '');
    startUrl = `${baseProxyUri}/start?${proxyParams.toString()}`;
  }

  // Buka in-app browser untuk login
  const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);

  if (result.type !== 'success' || !result.url) {
    return false;
  }

  // Gunakan Linking.parse yang aman untuk semua skema URL (exp:// maupun custom scheme)
  const { queryParams } = Linking.parse(result.url);
  const rawCode = queryParams?.code;
  const rawError = queryParams?.error;
  const rawState = queryParams?.state;

  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  const error = Array.isArray(rawError) ? rawError[0] : rawError;
  const returnedState = Array.isArray(rawState) ? rawState[0] : rawState;

  if (error) {
    throw new Error(`Spotify Auth Error: ${error}`);
  }

  const expectedState = await SecureStore.getItemAsync('spotify_pkce_state');
  if (expectedState && returnedState !== expectedState) {
    throw new Error(errors.stateMismatch);
  }

  if (!code) {
    throw new Error(errors.noAuthCode);
  }

  // Tukarkan code dengan access token menggunakan code_verifier
  await exchangeCodeForToken(code, verifier);
  await clearPkcePendingKeys();
  return true;
}

/**
 * Menukarkan authorization code dengan access token & refresh token
 */
async function exchangeCodeForToken(
  code: string,
  verifier: string,
  redirectUri: string = SPOTIFY_CONFIG.redirectUri
): Promise<SpotifyTokenResponse> {
  const errors = getTranslations(getActiveLanguage()).spotifyErrors;

  const body = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.clientId,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  let response: Response;
  try {
    response = await fetchWithTimeout(SPOTIFY_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  } catch (err) {
    if (isFetchTimeoutError(err)) {
      throw new Error(errors.requestTimeout);
    }
    throw err;
  }

  if (!response.ok) {
    const errText = await response.text();
    let detail = errText;
    try {
      const errJson = JSON.parse(errText);
      const desc = (errJson.error_description || errJson.error || '').toLowerCase();
      if (desc.includes('code_verifier') || desc.includes('code verifier')) {
        detail = errors.verifierMismatch;
      } else if (desc.includes('authorization code')) {
        detail = errors.authCodeExpired;
      } else if (desc.includes('redirect_uri')) {
        detail = errors.redirectMismatch(redirectUri);
      } else if (errJson.error_description) {
        detail = `${errJson.error}: ${errJson.error_description}`;
      }
    } catch {}
    throw new Error(errors.tokenExchangeFailed(response.status, detail));
  }

  const data: SpotifyTokenResponse = await response.json();
  await saveTokens(data);
  return data;
}

let refreshInFlight: Promise<string | null> | null = null;
let authGeneration = 0;
let cachedTokenState: { accessToken: string; expiresAt: number } | null = null;

async function clearPkcePendingKeys(): Promise<void> {
  await SecureStore.deleteItemAsync('spotify_pkce_verifier');
  await SecureStore.deleteItemAsync('spotify_pkce_redirect_uri');
  await SecureStore.deleteItemAsync('spotify_pkce_state');
}

/**
 * Eksekusi aktual refresh access token tanpa lock eksternal.
 */
async function performRefreshAccessToken(): Promise<string | null> {
  const generationAtStart = authGeneration;
  const refreshToken = await SecureStore.getItemAsync(SPOTIFY_CONFIG.storageKeys.refreshToken);
  if (!refreshToken) {
    await clearTokens();
    return null;
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  try {
    const response = await fetchWithTimeout(SPOTIFY_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      // Hanya bersihkan token lokal jika refresh token memang invalid/dicabut (400/401)
      if (response.status === 400 || response.status === 401) {
        if (generationAtStart === authGeneration) {
          await clearTokens();
        }
      } else {
        console.warn(`Refresh Spotify token gagal sementara (HTTP ${response.status}).`);
      }
      return null;
    }

    const data: SpotifyTokenResponse = await response.json();
    // Abaikan hasil refresh jika pengguna keburu logout/login ulang selama request berlangsung
    if (generationAtStart !== authGeneration) {
      return null;
    }
    await saveTokens(data);
    return data.access_token;
  } catch (err) {
    console.error('Error saat refresh Spotify token:', err);
    return null;
  }
}

/**
 * Melakukan refresh access token dengan single-flight mutex agar tidak terjadi race refresh paralel.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Menyimpan token secara terenkripsi di SecureStore + memperbarui cache memori
 */
async function saveTokens(data: SpotifyTokenResponse): Promise<void> {
  authGeneration += 1;
  // Simpan timestamp kedaluwarsa (berikan buffer 60 detik)
  const expiresAt = Date.now() + (data.expires_in - 60) * 1000;
  cachedTokenState = {
    accessToken: data.access_token,
    expiresAt,
  };

  await SecureStore.setItemAsync(SPOTIFY_CONFIG.storageKeys.accessToken, data.access_token);

  if (data.refresh_token) {
    await SecureStore.setItemAsync(SPOTIFY_CONFIG.storageKeys.refreshToken, data.refresh_token);
  }

  if (typeof data.scope === 'string' && data.scope.trim().length > 0) {
    await SecureStore.setItemAsync(SPOTIFY_CONFIG.storageKeys.grantedScope, data.scope.trim());
  }

  await SecureStore.setItemAsync(SPOTIFY_CONFIG.storageKeys.expiresAt, expiresAt.toString());
}

/**
 * Mengambil valid access token (membaca dari cache memori dulu agar polling tidak membebani SecureStore)
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (cachedTokenState && Date.now() < cachedTokenState.expiresAt) {
    return cachedTokenState.accessToken;
  }

  const token = await SecureStore.getItemAsync(SPOTIFY_CONFIG.storageKeys.accessToken);
  const expiresAtStr = await SecureStore.getItemAsync(SPOTIFY_CONFIG.storageKeys.expiresAt);

  if (!token) {
    cachedTokenState = null;
    return null;
  }

  const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;
  const isExpired = Date.now() >= expiresAt;

  if (isExpired) {
    cachedTokenState = null;
    return await refreshAccessToken();
  }

  cachedTokenState = {
    accessToken: token,
    expiresAt,
  };
  return token;
}

/**
 * Cek status apakah user sedang login ke Spotify
 */
export async function isSpotifyAuthenticated(): Promise<boolean> {
  const token = await getValidAccessToken();
  return !!token;
}

export async function getCachedSpotifyProfile(): Promise<SpotifyUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(SPOTIFY_CONFIG.storageKeys.userProfile);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpotifyUser>;
    return typeof parsed?.id === 'string' ? (parsed as SpotifyUser) : null;
  } catch {
    return null;
  }
}

export async function saveCachedSpotifyProfile(profile: SpotifyUser): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      SPOTIFY_CONFIG.storageKeys.userProfile,
      JSON.stringify(profile)
    );
  } catch {
    // Non-fatal: cache profil bersifat opsional
  }
}

/**
 * Menyelesaikan otorisasi jika pengguna menyalin link dari tombol 'Return to the app'
 */
export async function completeAuthWithUrl(urlOrCode: string): Promise<boolean> {
  const errors = getTranslations(getActiveLanguage()).spotifyErrors;

  const verifier = await SecureStore.getItemAsync('spotify_pkce_verifier');
  if (!verifier) {
    throw new Error(errors.pkceSessionMissing);
  }

  const savedRedirectUri = await SecureStore.getItemAsync('spotify_pkce_redirect_uri');
  const redirectUri = savedRedirectUri || SPOTIFY_CONFIG.redirectUri;
  const expectedState = await SecureStore.getItemAsync('spotify_pkce_state');

  let code = urlOrCode.trim();

  // Cek apakah ada error penolakan dari Spotify
  if (code.includes('error=')) {
    const matchErr = code.match(/[?&]error=([^&#]+)/);
    const errDesc = code.match(/[?&]error_description=([^&#]+)/);
    const errText = errDesc
      ? decodeURIComponent(errDesc[1])
      : matchErr
      ? decodeURIComponent(matchErr[1])
      : errors.accessDenied;
    throw new Error(errors.spotifyCanceledLogin(errText));
  }

  const isCallbackUrl = code.includes('://') || code.includes('?');
  if (isCallbackUrl && expectedState) {
    const stateMatch = code.match(/[?&]state=([^&#]+)/);
    const returnedState = stateMatch?.[1] ? decodeURIComponent(stateMatch[1]) : undefined;
    if (returnedState !== expectedState) {
      throw new Error(errors.stateMismatch);
    }
  }

  // Jika berupa URL lengkap
  if (code.includes('code=')) {
    const match = code.match(/[?&]code=([^&#]+)/);
    if (match && match[1]) {
      code = decodeURIComponent(match[1]);
    } else {
      const parsed = Linking.parse(code);
      const raw = parsed.queryParams?.code;
      code = Array.isArray(raw) ? raw[0] : (raw || code);
    }
  }

  // Hapus karakter slash atau spasi berlebih di akhir
  code = code.replace(/\/+$/, '').trim();

  if (!code) {
    throw new Error(errors.noCodeInLink);
  }

  await exchangeCodeForToken(code, verifier, redirectUri);
  await clearPkcePendingKeys();
  return true;
}

/**
 * Logout & bersihkan seluruh token Spotify
 */
export async function clearTokens(): Promise<void> {
  authGeneration += 1;
  cachedTokenState = null;
  await SecureStore.deleteItemAsync(SPOTIFY_CONFIG.storageKeys.accessToken);
  await SecureStore.deleteItemAsync(SPOTIFY_CONFIG.storageKeys.refreshToken);
  await SecureStore.deleteItemAsync(SPOTIFY_CONFIG.storageKeys.expiresAt);
  await SecureStore.deleteItemAsync(SPOTIFY_CONFIG.storageKeys.userProfile);
  await SecureStore.deleteItemAsync(SPOTIFY_CONFIG.storageKeys.grantedScope);
  await clearPkcePendingKeys();
}

export async function getGrantedScopes(): Promise<string[] | null> {
  const raw = await SecureStore.getItemAsync(SPOTIFY_CONFIG.storageKeys.grantedScope);
  if (!raw) return null;
  return raw
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export async function hasRecentlyPlayedScope(): Promise<boolean> {
  const scopes = await getGrantedScopes();
  if (!scopes) return false;
  return scopes.includes('user-read-recently-played');
}

