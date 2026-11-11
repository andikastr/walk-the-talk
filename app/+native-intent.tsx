/**
 * Menangani incoming native deep link di Expo Router sebelum pencocokan route berjalan.
 * Mencegah redirect OAuth Spotify (`walkthetalk://expo-auth-session` atau `walkthetalk://callback`)
 * membuka layar 404 (+not-found) ketika WebBrowser.openAuthSessionAsync menyelesaikan sesi login.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    const lower = path.toLowerCase();
    const isSpotifyAuthCallback =
      lower.includes('expo-auth-session') ||
      /(^|\/|:\/\/)callback(\?|#|$)/i.test(path) ||
      /[?&#](code|error)=/i.test(path);

    if (isSpotifyAuthCallback) {
      // Saat app sudah aktif (!initial), biarkan user tetap di halaman saat ini
      // karena WebBrowser.openAuthSessionAsync sudah menerima result.url.
      // Saat cold start (initial), arahkan ke Beranda alih-alih +not-found.
      return initial ? '/' : null;
    }

    return path;
  } catch {
    return '/';
  }
}

