import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
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

import { useAppUpdates } from '@/hooks/useAppUpdates';
import { SpotifyAuthProvider } from '@/context/SpotifyAuthContext';
import { FONT_FAMILY, PALETTE } from '@/constants/Colors';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  anchor: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const PaperTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: PALETTE.accent,
    background: PALETTE.surface,
    card: PALETTE.surface,
    text: PALETTE.onSurface,
    border: PALETTE.border,
    notification: PALETTE.accent,
  },
};

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

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  useAppUpdates();

  return (
    <SpotifyAuthProvider>
      <ThemeProvider value={PaperTheme}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: PALETTE.surface },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="workout/[id]"
          options={{
            title: 'Detail Aktivitas',
            headerStyle: { backgroundColor: PALETTE.surface },
            headerTitleStyle: {
              fontFamily: FONT_FAMILY.displaySemiBold,
              fontSize: 17,
              color: PALETTE.onSurface,
            },
            headerTintColor: PALETTE.onSurface,
            headerShadowVisible: false,
            headerBackTitle: 'Kembali',
          }}
        />
        <Stack.Screen
          name="modal"
          options={{
            presentation: 'modal',
            headerStyle: { backgroundColor: PALETTE.surface },
            headerTitleStyle: {
              fontFamily: FONT_FAMILY.displaySemiBold,
              color: PALETTE.onSurface,
            },
            headerTintColor: PALETTE.onSurface,
            headerShadowVisible: false,
          }}
        />
      </Stack>
      </ThemeProvider>
    </SpotifyAuthProvider>
  );
}
