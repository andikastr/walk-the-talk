import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import {
  DARK_PALETTE,
  LIGHT_PALETTE,
  ResolvedTheme,
  ThemeMode,
  ThemePalette,
} from '@/constants/Colors';
import {
  AppLanguage,
  TranslationDictionary,
  getLocaleTag,
  getTranslations,
  setActiveLanguage,
} from '@/constants/i18n';
import { WORKOUT_CONFIG } from '@/constants/Config';
import { getAppSetting, setAppSetting } from '@/services/database/workout-repo';

const STORAGE_KEYS = {
  themeMode: 'theme_mode',
  language: 'language',
  weightKg: 'body_weight_kg',
  autoPauseEnabled: 'auto_pause_enabled',
} as const;

interface AppPreferencesContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  palette: ThemePalette;
  language: AppLanguage;
  locale: string;
  t: TranslationDictionary;
  weightKg: number;
  autoPauseEnabled: boolean;
  isLoaded: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  setWeightKg: (kg: number) => Promise<void>;
  setAutoPauseEnabled: (enabled: boolean) => Promise<void>;
}

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export function AppPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [language, setLanguageState] = useState<AppLanguage>('id');
  const [weightKg, setWeightKgState] = useState<number>(WORKOUT_CONFIG.defaultWeightKg);
  const [autoPauseEnabled, setAutoPauseEnabledState] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [savedTheme, savedLang, savedWeight, savedAutoPause] = await Promise.all([
          getAppSetting(STORAGE_KEYS.themeMode),
          getAppSetting(STORAGE_KEYS.language),
          getAppSetting(STORAGE_KEYS.weightKg),
          getAppSetting(STORAGE_KEYS.autoPauseEnabled),
        ]);

        if (!isMounted) return;

        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setThemeModeState(savedTheme);
        }
        if (savedLang === 'id' || savedLang === 'en') {
          setActiveLanguage(savedLang);
          setLanguageState(savedLang);
        }
        if (savedWeight) {
          const parsedWeight = Number(savedWeight);
          if (
            Number.isFinite(parsedWeight) &&
            parsedWeight >= WORKOUT_CONFIG.minWeightKg &&
            parsedWeight <= WORKOUT_CONFIG.maxWeightKg
          ) {
            setWeightKgState(Math.round(parsedWeight));
          }
        }
        if (savedAutoPause === 'true' || savedAutoPause === 'false') {
          setAutoPauseEnabledState(savedAutoPause === 'true');
        }
      } catch (err) {
        console.warn('Gagal memuat preferensi aplikasi:', err);
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await setAppSetting(STORAGE_KEYS.themeMode, mode);
    } catch (err) {
      console.warn('Gagal menyimpan preferensi tema:', err);
    }
  }, []);

  const setLanguage = useCallback(async (lang: AppLanguage) => {
    setActiveLanguage(lang);
    setLanguageState(lang);
    try {
      await setAppSetting(STORAGE_KEYS.language, lang);
    } catch (err) {
      console.warn('Gagal menyimpan preferensi bahasa:', err);
    }
  }, []);

  const setWeightKg = useCallback(async (kg: number) => {
    if (!Number.isFinite(kg)) return;
    const clamped = Math.round(
      Math.min(WORKOUT_CONFIG.maxWeightKg, Math.max(WORKOUT_CONFIG.minWeightKg, kg))
    );
    setWeightKgState(clamped);
    try {
      await setAppSetting(STORAGE_KEYS.weightKg, String(clamped));
    } catch (err) {
      console.warn('Gagal menyimpan berat badan:', err);
    }
  }, []);

  const setAutoPauseEnabled = useCallback(async (enabled: boolean) => {
    setAutoPauseEnabledState(enabled);
    try {
      await setAppSetting(STORAGE_KEYS.autoPauseEnabled, enabled ? 'true' : 'false');
    } catch (err) {
      console.warn('Gagal menyimpan pengaturan auto-pause:', err);
    }
  }, []);

  const resolvedTheme: ResolvedTheme =
    themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;

  const isDark = resolvedTheme === 'dark';
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const t = useMemo(() => getTranslations(language), [language]);
  const locale = getLocaleTag(language);

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      themeMode,
      resolvedTheme,
      isDark,
      palette,
      language,
      locale,
      t,
      weightKg,
      autoPauseEnabled,
      isLoaded,
      setThemeMode,
      setLanguage,
      setWeightKg,
      setAutoPauseEnabled,
    }),
    [
      themeMode,
      resolvedTheme,
      isDark,
      palette,
      language,
      locale,
      t,
      weightKg,
      autoPauseEnabled,
      isLoaded,
      setThemeMode,
      setLanguage,
      setWeightKg,
      setAutoPauseEnabled,
    ]
  );

  return (
    <AppPreferencesContext.Provider value={value}>
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function usePreferences(): AppPreferencesContextValue {
  const ctx = useContext(AppPreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used inside AppPreferencesProvider');
  }
  return ctx;
}

export function useThemePalette(): ThemePalette {
  return usePreferences().palette;
}

export function useTranslation() {
  const { language, locale, t, setLanguage } = usePreferences();
  return { language, locale, t, setLanguage };
}

