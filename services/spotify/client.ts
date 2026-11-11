import { SPOTIFY_CONFIG } from '@/constants/Config';
import { getActiveLanguage, getTranslations } from '@/constants/i18n';
import { getValidAccessToken, refreshAccessToken } from './auth';
import { SpotifyApiErrorResponse } from '@/types/spotify';

const MAX_RETRIES = 3;

/**
 * Custom Error class untuk Spotify API Error sesuai skema OpenAPI
 */
export class SpotifyApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SpotifyApiError';
    this.status = status;
  }
}

/**
 * Delay helper untuk exponential backoff
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Specialized Fetch Client untuk Spotify Web API
 * Mengimplementasikan:
 * - Bearer Token Injection
 * - Auto-refresh token pada 401 Unauthorized
 * - Exponential backoff & Retry-After handling pada 429 Too Many Requests
 * - Parsing respons error sesuai Spotify OpenAPI
 */
export async function spotifyFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount: number = 0
): Promise<T> {
  const errors = getTranslations(getActiveLanguage()).spotifyErrors;
  const token = await getValidAccessToken();

  if (!token) {
    throw new SpotifyApiError(401, errors.unauthenticated);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${SPOTIFY_CONFIG.apiBaseUrl}${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string>),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // 204 No Content (biasa dikembalikan oleh kontrol playback seperti play, pause, next)
    if (response.status === 204) {
      return {} as T;
    }

    // 401 Unauthorized: gunakan token baru jika caller lain baru saja me-refresh, atau refresh via mutex
    if (response.status === 401 && retryCount === 0) {
      const latestToken = await getValidAccessToken();
      if (latestToken && latestToken !== token) {
        return spotifyFetch<T>(endpoint, options, retryCount + 1);
      }

      console.warn('Spotify 401 Unauthorized, mencoba me-refresh access token...');
      const newToken = await refreshAccessToken();
      if (newToken) {
        return spotifyFetch<T>(endpoint, options, retryCount + 1);
      }
      throw new SpotifyApiError(401, errors.sessionExpired);
    }

    // 429 Too Many Requests: Exponential Backoff & Retry-After header
    if (response.status === 429 && retryCount < MAX_RETRIES) {
      const retryAfterHeader = response.headers.get('Retry-After');
      let waitSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;

      if (!waitSeconds || isNaN(waitSeconds)) {
        // Default exponential backoff: 2^retryCount * 1000ms + random jitter
        const jitter = Math.random() * 500;
        waitSeconds = Math.pow(2, retryCount) + jitter / 1000;
      }

      console.warn(
        `Spotify 429 Rate Limit. Menunggu ${waitSeconds}s sebelum mencoba kembali (Percobaan ${retryCount + 1}/${MAX_RETRIES})...`
      );

      await delay(waitSeconds * 1000);
      return spotifyFetch<T>(endpoint, options, retryCount + 1);
    }

    // Tangani error status lainnya
    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}`;
      try {
        const errorBody: SpotifyApiErrorResponse = await response.json();
        if (errorBody.error && errorBody.error.message) {
          errorMessage = errorBody.error.message;
        }
      } catch {
        const text = await response.text();
        if (text) errorMessage = text;
      }

      // Berikan konteks edukatif khusus untuk status 403 Forbidden pada kontrol playback
      if (response.status === 403 && endpoint.includes('/player')) {
        errorMessage = errors.premiumRequired;
      }

      // 404 pada endpoint player sering terjadi jika tidak ada Active Device
      if (response.status === 404 && endpoint.includes('/player')) {
        errorMessage = errors.noDeviceAvailable;
      }

      throw new SpotifyApiError(response.status, errorMessage);
    }

    // Parsing JSON respons yang sukses
    const data = await response.json();
    return data as T;
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      throw error;
    }
    throw new SpotifyApiError(500, (error as Error).message || errors.networkError);
  }
}

