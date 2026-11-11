import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import {
  Cpu,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react-native';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer';
import { FONT_FAMILY, PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { SpotifyAttribution } from './SpotifyAttribution';
import { DevicePickerModal } from './DevicePickerModal';

/**
 * Floating-style card-inverse (#0E0F0C) Mini Player untuk Home & layar Lari.
 * Menggunakan paper pill untuk tombol play/pause agar alokasi warna Lime tetap tunggal per layar.
 */
export function RunnerMiniPlayer() {
  const { isAuthenticated, login, isLoading: isAuthLoading } = useSpotifyAuth();
  const {
    currentTrack,
    isPlaying,
    activeDevice,
    devices,
    isLoading: isPlayerLoading,
    errorMessage,
    togglePlay,
    next,
    previous,
    refreshDevices,
    selectDevice,
  } = useSpotifyPlayer();

  const [deviceModalVisible, setDeviceModalVisible] = useState(false);

  // Belum login ke Spotify
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.notAuthRow}>
          <View style={styles.notAuthInfo}>
            <View style={styles.spotifyMarkWrap}>
              <FontAwesome name="spotify" size={20} color={PALETTE.spotifyGreen} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.kickerInverse}>SPOTIFY CONNECT</Text>
              <Text style={styles.notAuthTitle} numberOfLines={1}>
                Putar musik saat berlari
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hubungkan akun Spotify"
            style={({ pressed }) => [styles.connectButton, pressed && { opacity: 0.85 }]}
            onPress={login}
            disabled={isAuthLoading}
          >
            {isAuthLoading ? (
              <ActivityIndicator size="small" color={PALETTE.onSurface} />
            ) : (
              <Text style={styles.connectButtonText}>Hubungkan</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // Sudah login tetapi belum ada lagu aktif
  if (!currentTrack) {
    return (
      <View style={styles.container}>
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText} numberOfLines={1}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.emptyRow}>
          <View style={styles.spotifyMarkWrap}>
            <FontAwesome name="spotify" size={20} color={PALETTE.spotifyGreen} />
          </View>
          <View style={{ flex: 1, minWidth: 0, marginHorizontal: SPACING.md }}>
            <Text style={styles.kickerInverse}>SPOTIFY SIAP</Text>
            <Text style={styles.emptySubtitle} numberOfLines={1}>
              {activeDevice
                ? `Aktif di ${activeDevice.name}`
                : 'Tekan Play untuk mulai memutar'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Putar musik Spotify"
            style={({ pressed }) => [styles.paperCirclePlay, pressed && { opacity: 0.78 }]}
            onPress={togglePlay}
            disabled={isPlayerLoading}
          >
            {isPlayerLoading ? (
              <ActivityIndicator size="small" color={PALETTE.onSurface} />
            ) : (
              <Play size={16} strokeWidth={2} color={PALETTE.onSurface} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pilih perangkat Spotify"
            style={({ pressed }) => [styles.devicesButton, pressed && { opacity: 0.7 }]}
            onPress={() => {
              refreshDevices();
              setDeviceModalVisible(true);
            }}
          >
            <Cpu size={16} strokeWidth={2} color={PALETTE.onInverse} />
          </Pressable>
        </View>

        <DevicePickerModal
          visible={deviceModalVisible}
          devices={devices}
          activeDevice={activeDevice}
          onSelect={(id) => {
            selectDevice(id);
            setDeviceModalVisible(false);
          }}
          onClose={() => setDeviceModalVisible(false)}
        />
      </View>
    );
  }

  const albumImageUrl = currentTrack.album?.images?.[0]?.url;
  const artistNames = currentTrack.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

  return (
    <View style={styles.container}>
      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText} numberOfLines={1}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <View style={styles.playerRow}>
        {/* Album Art inside rounded-18 ink frame */}
        <View style={styles.albumFrame}>
          {albumImageUrl ? (
            <Image source={{ uri: albumImageUrl }} style={styles.albumArt} resizeMode="cover" />
          ) : (
            <Music size={20} strokeWidth={2} color={PALETTE.onInverseMuted} />
          )}
        </View>

        {/* Track & Artist Info */}
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {currentTrack.name}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {artistNames}
          </Text>
          <View style={styles.deviceRow}>
            <SpotifyAttribution size="small" variant="dark" />
            {activeDevice && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Perangkat aktif ${activeDevice.name}`}
                onPress={() => {
                  refreshDevices();
                  setDeviceModalVisible(true);
                }}
                style={({ pressed }) => [styles.deviceIndicator, pressed && { opacity: 0.7 }]}
              >
                <Volume2 size={12} strokeWidth={2} color={PALETTE.spotifyGreen} />
                <Text style={styles.deviceName} numberOfLines={1}>
                  {activeDevice.name}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Control Buttons */}
        <View style={styles.controlsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lagu sebelumnya"
            onPress={previous}
            disabled={isPlayerLoading}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.65 }]}
          >
            <SkipBack size={18} strokeWidth={2} color={PALETTE.onInverse} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Jeda musik' : 'Putar musik'}
            style={({ pressed }) => [styles.paperCirclePlay, pressed && { opacity: 0.8 }]}
            onPress={togglePlay}
            disabled={isPlayerLoading}
          >
            {isPlayerLoading ? (
              <ActivityIndicator size="small" color={PALETTE.onSurface} />
            ) : isPlaying ? (
              <Pause size={16} strokeWidth={2} color={PALETTE.onSurface} />
            ) : (
              <Play size={16} strokeWidth={2} color={PALETTE.onSurface} />
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lagu berikutnya"
            onPress={next}
            disabled={isPlayerLoading}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.65 }]}
          >
            <SkipForward size={18} strokeWidth={2} color={PALETTE.onInverse} />
          </Pressable>
        </View>
      </View>

      <DevicePickerModal
        visible={deviceModalVisible}
        devices={devices}
        activeDevice={activeDevice}
        onSelect={(id) => {
          selectDevice(id);
          setDeviceModalVisible(false);
        }}
        onClose={() => setDeviceModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: PALETTE.surfaceInverse,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.lg,
  },
  kickerInverse: {
    ...TYPOGRAPHY.caption,
    color: PALETTE.onInverseMuted,
    marginBottom: 2,
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 90, 31, 0.16)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  errorText: {
    ...TYPOGRAPHY.labelSm,
    color: PALETTE.accent,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  albumFrame: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(244, 242, 236, 0.08)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumArt: {
    width: '100%',
    height: '100%',
  },
  trackInfo: {
    flex: 1,
    marginLeft: SPACING.md,
    marginRight: SPACING.sm,
    minWidth: 0,
  },
  trackTitle: {
    ...TYPOGRAPHY.headlineSm,
    color: PALETTE.onInverse,
  },
  trackArtist: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onInverseMuted,
    marginTop: 2,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 5,
  },
  deviceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  deviceName: {
    ...TYPOGRAPHY.labelSm,
    color: PALETTE.onInverse,
    maxWidth: 100,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paperCirclePlay: {
    backgroundColor: PALETTE.onInverse,
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notAuthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  notAuthInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
    minWidth: 0,
  },
  spotifyMarkWrap: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(244, 242, 236, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notAuthTitle: {
    ...TYPOGRAPHY.headlineSm,
    color: PALETTE.onInverse,
  },
  connectButton: {
    backgroundColor: PALETTE.onInverse,
    height: 36,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButtonText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
    color: PALETTE.onSurface,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptySubtitle: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onInverse,
  },
  devicesButton: {
    backgroundColor: 'rgba(244, 242, 236, 0.14)',
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
  },
});
