import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';

interface SpotifyAttributionProps {
  size?: 'small' | 'medium';
  variant?: 'dark' | 'light';
}

export function SpotifyAttribution({
  size = 'small',
  variant = 'dark',
}: SpotifyAttributionProps) {
  const { palette } = usePreferences();
  const isSmall = size === 'small';
  const textColor =
    variant === 'dark' ? palette.onFeatureMuted : palette.onSurfaceVariant;

  return (
    <View style={styles.container}>
      <FontAwesome
        name="spotify"
        size={isSmall ? 14 : 18}
        color={palette.spotifyGreen}
      />
      <Text
        style={[
          styles.text,
          { color: textColor, fontSize: isSmall ? 10 : 12 },
        ]}
      >
        Spotify
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  text: {
    ...TYPOGRAPHY.labelUppercase,
    letterSpacing: 1.2,
  },
});
