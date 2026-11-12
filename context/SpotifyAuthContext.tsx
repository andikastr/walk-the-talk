import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  clearTokens,
  completeAuthWithUrl,
  getCachedSpotifyProfile,
  hasRecentlyPlayedScope,
  isSpotifyAuthenticated,
  loginWithSpotify,
  saveCachedSpotifyProfile,
} from '@/services/spotify/auth';
import { getCurrentUser } from '@/services/spotify/player';
import { getActiveLanguage, getTranslations } from '@/constants/i18n';
import { SpotifyUser } from '@/types/spotify';

interface SpotifyAuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  hasRecentlyPlayedPermission: boolean;
  user: SpotifyUser | null;
  error: string | null;
  login: () => Promise<boolean>;
  completeManualAuth: (
    urlOrCode: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const SpotifyAuthContext = createContext<SpotifyAuthContextValue | null>(null);

export function SpotifyAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasRecentlyPlayedPermission, setHasRecentlyPlayedPermission] =
    useState<boolean>(true);
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const syncAuthState = useCallback(async (showSpinner: boolean = true) => {
    try {
      if (showSpinner) {
        setIsLoading(true);
      }
      setError(null);
      const authed = await isSpotifyAuthenticated();
      if (!isMountedRef.current) return;

      setIsAuthenticated(authed);

      if (!authed) {
        setUser(null);
        setHasRecentlyPlayedPermission(false);
        return;
      }

      const [hasHistoryScope, cachedProfile] = await Promise.all([
        hasRecentlyPlayedScope(),
        getCachedSpotifyProfile(),
      ]);

      if (!isMountedRef.current) return;
      setHasRecentlyPlayedPermission(hasHistoryScope);
      if (cachedProfile) {
        setUser((prev) => prev ?? cachedProfile);
      }

      try {
        const profile = await getCurrentUser();
        if (isMountedRef.current) {
          setUser(profile);
        }
        await saveCachedSpotifyProfile(profile);
      } catch (err: any) {
        console.warn('Gagal memuat profil Spotify pengguna:', err.message);
        if (err?.status === 401 && isMountedRef.current) {
          setIsAuthenticated(false);
          setUser(null);
          setHasRecentlyPlayedPermission(false);
        }
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(
          err.message || getTranslations(getActiveLanguage()).spotifyErrors.checkAuthFailed
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const checkAuth = useCallback(() => syncAuthState(true), [syncAuthState]);

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        void syncAuthState(false);
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      isMountedRef.current = false;
    };
  }, [syncAuthState]);

  const login = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const success = await loginWithSpotify();
      if (success) {
        await checkAuth();
      }
      return success;
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(
          err.message || getTranslations(getActiveLanguage()).spotifyErrors.loginCanceled
        );
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [checkAuth]);

  const completeManualAuth = useCallback(
    async (
      urlOrCode: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        setIsLoading(true);
        setError(null);
        const success = await completeAuthWithUrl(urlOrCode);
        if (success) {
          await checkAuth();
        }
        return { success: true };
      } catch (err: any) {
        const msg =
          err.message || getTranslations(getActiveLanguage()).spotifyErrors.loginCanceled;
        if (isMountedRef.current) {
          setError(msg);
        }
        return { success: false, error: msg };
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [checkAuth]
  );

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Kosongkan state auth secara global terlebih dahulu agar seluruh tab langsung sinkron
      setIsAuthenticated(false);
      setHasRecentlyPlayedPermission(false);
      setUser(null);
      await clearTokens();
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(
          err.message || getTranslations(getActiveLanguage()).spotifyErrors.logoutFailed
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const value = useMemo<SpotifyAuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      hasRecentlyPlayedPermission,
      user,
      error,
      login,
      completeManualAuth,
      logout,
      refreshUser: checkAuth,
    }),
    [
      isAuthenticated,
      isLoading,
      hasRecentlyPlayedPermission,
      user,
      error,
      login,
      completeManualAuth,
      logout,
      checkAuth,
    ]
  );

  return (
    <SpotifyAuthContext.Provider value={value}>
      {children}
    </SpotifyAuthContext.Provider>
  );
}

export function useSpotifyAuthContext(): SpotifyAuthContextValue {
  const ctx = useContext(SpotifyAuthContext);
  if (!ctx) {
    throw new Error('useSpotifyAuth must be used inside SpotifyAuthProvider');
  }
  return ctx;
}
