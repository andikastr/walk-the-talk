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
import { getAppSetting, setAppSetting } from '@/services/database/workout-repo';

const STORAGE_KEYS = {
  themeMode: 'theme_mode',
  language: 'language',
} as const;

interface AppPreferencesContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  palette: ThemePalette;
  language: AppLanguage;
  locale: string;
  t: TranslationDictionary;
  isLoaded: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setLanguage: (lang: AppLanguage) => Promise<void>;
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
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [savedTheme, savedLang] = await Promise.all([
          getAppSetting(STORAGE_KEYS.themeMode),
          getAppSetting(STORAGE_KEYS.language),
        ]);

        if (!isMounted) return;

        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setThemeModeState(savedTheme);
        }
        if (savedLang === 'id' || savedLang === 'en') {
          setActiveLanguage(savedLang);
          setLanguageState(savedLang);
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
      isLoaded,
      setThemeMode,
      setLanguage,
    }),
    [themeMode, resolvedTheme, isDark, palette, language, locale, t, isLoaded, setThemeMode, setLanguage]
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

