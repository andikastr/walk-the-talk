import { useEffect, useMemo } from 'react';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useReducedMotion } from 'react-native-reanimated';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';

import '@/services/location/background-task';
import { AppPreferencesProvider, usePreferences } from '@/context/AppPreferencesContext';
import { AppDialogProvider } from '@/context/AppDialogContext';
import { AppUpdatesProvider } from '@/context/AppUpdatesContext';
import { SpotifyAuthProvider } from '@/context/SpotifyAuthContext';
import { SpotifyPlayerProvider } from '@/context/SpotifyPlayerContext';
import { FONT_FAMILY } from '@/constants/Colors';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading/deep-linking directly keeps the primary tabs screen as anchor.
  anchor: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AppPreferencesProvider>
      <AppDialogProvider>
        <AppUpdatesProvider>
          <RootLayoutNav />
        </AppUpdatesProvider>
      </AppDialogProvider>
    </AppPreferencesProvider>
  );
}

function RootLayoutNav() {
  const { palette, isDark, t } = usePreferences();
  const reduced = useReducedMotion();

  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      dark: isDark,
      colors: {
        ...DefaultTheme.colors,
        primary: palette.accent,
        background: palette.surface,
        card: palette.surface,
        text: palette.onSurface,
        border: palette.border,
        notification: palette.accent,
      },
    }),
    [isDark, palette]
  );

  return (
    <SpotifyAuthProvider>
      <SpotifyPlayerProvider>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: palette.surface },
              animation: reduced ? 'fade' : 'slide_from_right',
              animationMatchesGesture: true,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="workout/[id]"
              options={{
                title: t.routes.workoutDetail,
                animation: reduced ? 'fade' : 'slide_from_right',
                animationMatchesGesture: true,
                headerStyle: { backgroundColor: palette.surface },
                headerTitleStyle: {
                  fontFamily: FONT_FAMILY.displaySemiBold,
                  fontSize: 17,
                  color: palette.onSurface,
                },
                headerTintColor: palette.onSurface,
                headerShadowVisible: false,
                headerBackTitle: t.common.back,
              }}
            />
          </Stack>
        </ThemeProvider>
      </SpotifyPlayerProvider>
    </SpotifyAuthProvider>
  );
}
