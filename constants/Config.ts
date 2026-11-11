/**
 * Spotify Web API & App Configuration
 * Berdasarkan Spotify OpenAPI Specification:
 * https://developer.spotify.com/reference/web-api/open-api-schema.yaml
 */

export const SPOTIFY_CONFIG = {
  clientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || '',
  redirectUri: process.env.EXPO_PUBLIC_SPOTIFY_REDIRECT_URI || 'walkthetalk://callback',
  
  // Endpoint resmi Spotify
  authEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
  apiBaseUrl: 'https://api.spotify.com/v1',

  // Minimal Scopes (Prinsip Least Privilege)
  scopes: [
    'user-read-playback-state',     // Status playback & device
    'user-modify-playback-state',   // Kontrol play, pause, skip
    'user-read-currently-playing',  // Lagu aktif
    'playlist-read-private',        // Playlist workout pengguna
    'user-read-private',            // Info profil pengguna
    'user-read-email',              // Info tipe akun (premium vs free)
  ],

  // Storage keys untuk expo-secure-store
  storageKeys: {
    accessToken: 'spotify_access_token',
    refreshToken: 'spotify_refresh_token',
    expiresAt: 'spotify_expires_at',
    userProfile: 'spotify_user_profile',
  },
};

export const WORKOUT_CONFIG = {
  // Akurasi minimum GPS dalam meter yang diterima (mengabaikan titik noise)
  gpsMaxAccuracyMeters: 25,
  // Jarak minimum pergerakan dalam meter untuk mencatat titik baru (mencegah drift saat diam)
  minMovementDistanceMeters: 3,
  // Interval update lokasi GPS (dalam ms)
  locationTimeIntervalMs: 2000,
  // Jarak update lokasi GPS (dalam meter)
  locationDistanceIntervalMeters: 2,
  // Berat badan default (kg) untuk estimasi kalori MET jika belum diatur
  defaultWeightKg: 65,
  // Estimasi panjang langkah (meter/langkah) untuk fallback pedometer saat sensor tidak aktif
  strideMetersByType: {
    walk: 0.72,
    jog: 0.9,
    run: 1.05,
  },
};

export const MAP_CONFIG = {
  cartoApiKey: (process.env.EXPO_PUBLIC_CARTO_API_KEY || '').trim(),
};

