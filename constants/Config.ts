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
    'user-read-recently-played',    // Riwayat lagu saat background / layar mati
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
    grantedScope: 'spotify_granted_scope',
  },
};

export const WORKOUT_CONFIG = {
  // Akurasi GPS bagus untuk indikator siap (meter)
  gpsGoodAccuracyMeters: 15,
  // Akurasi minimum GPS saat cold start sebelum mengunci titik pertama (meter)
  gpsColdStartAccuracyMeters: 20,
  // Akurasi minimum GPS dalam meter yang diterima (mengabaikan titik noise)
  gpsMaxAccuracyMeters: 25,
  // Jarak minimum pergerakan dalam meter untuk mencatat titik baru (mencegah drift saat diam)
  minMovementDistanceMeters: 3,
  // Kecepatan maksimum realistis (m/s, ~43 km/jam) untuk memfilter spike/teleport GPS
  maxPlausibleSpeedMps: 12,
  // Batas lonjakan elevasi tunggal yang dianggap valid (meter) & ambang noise vertikal
  elevationNoiseThresholdMeters: 3.5,
  maxSingleElevationStepMeters: 20,
  // Interval update lokasi GPS (dalam ms)
  locationTimeIntervalMs: 2000,
  // Jarak update lokasi GPS (dalam meter)
  locationDistanceIntervalMeters: 2,
  // Auto-pause threshold: jeda otomatis setelah diam >= 8 detik tanpa langkah
  autoPauseSpeedMps: 0.45,
  autoPauseIdleMs: 8000,
  autoResumeSpeedMps: 0.85,
  autoResumeMinMovementMeters: 4,
  autoResumeMinSteps: 4,
  // Interval penyimpanan checkpoint crash-recovery ke SQLite (ms)
  checkpointIntervalMs: 15000,
  // Jarak hening sensor pedometer sebelum fallback estimasi aktif (meter)
  silentSensorFallbackMeters: 30,
  // Berat badan default & rentang valid (kg) untuk estimasi kalori MET
  defaultWeightKg: 65,
  minWeightKg: 30,
  maxWeightKg: 250,
  // Estimasi panjang langkah default (meter/langkah) saat kalibrasi pribadi belum terbentuk
  strideMetersByType: {
    walk: 0.72,
    jog: 0.9,
    run: 1.05,
  },
  minCalibratedStrideMeters: 0.45,
  maxCalibratedStrideMeters: 1.85,
  minCalibrationSteps: 100,
  minCalibrationDistanceMeters: 70,
};

export const MAP_CONFIG = {
  cartoApiKey: (process.env.EXPO_PUBLIC_CARTO_API_KEY || '').trim(),
};

