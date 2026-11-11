import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { PALETTE, TYPOGRAPHY } from '@/constants/Colors';

interface SpotifyAttributionProps {
  size?: 'small' | 'medium';
  variant?: 'dark' | 'light';
}

export function SpotifyAttribution({
  size = 'small',
  variant = 'dark',
}: SpotifyAttributionProps) {
  const isSmall = size === 'small';
  const textColor =
    variant === 'dark' ? PALETTE.onInverseMuted : PALETTE.onSurfaceVariant;

  return (
    <View style={styles.container}>
      <FontAwesome
        name="spotify"
        size={isSmall ? 14 : 18}
        color={PALETTE.spotifyGreen}
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
