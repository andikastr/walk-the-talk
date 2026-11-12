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
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';
import { resolveSpotifyMediaMeta } from '@/services/spotify/player';
import { SpotifyAttribution } from './SpotifyAttribution';
import { DevicePickerModal } from './DevicePickerModal';

/**
 * Floating-style card-inverse Mini Player untuk Home & layar Lari.
 * Menggunakan paper pill untuk tombol play/pause agar alokasi warna Lime tetap tunggal per layar.
 */
export function RunnerMiniPlayer() {
  const { palette, isDark, t } = usePreferences();
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

  const cardSurfaceStyle = [
    styles.container,
    { backgroundColor: palette.surfaceFeature },
    isDark && { borderWidth: 1, borderColor: palette.border },
  ];

  // Belum login ke Spotify
  if (!isAuthenticated) {
    return (
      <View style={cardSurfaceStyle}>
        <View style={styles.notAuthRow}>
          <View style={styles.notAuthInfo}>
            <View style={styles.spotifyMarkWrap}>
              <FontAwesome name="spotify" size={20} color={palette.spotifyGreen} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kickerInverse, { color: palette.onFeatureMuted }]}>
                {t.music.deviceModalKicker}
              </Text>
              <Text
                style={[styles.notAuthTitle, { color: palette.onFeature }]}
                numberOfLines={1}
              >
                {t.music.miniNotAuthTitle}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.music.miniConnectA11y}
            style={({ pressed }) => [
              styles.connectButton,
              { backgroundColor: palette.onFeature },
              pressed && { opacity: 0.85 },
            ]}
            onPress={login}
            disabled={isAuthLoading}
          >
            {isAuthLoading ? (
              <ActivityIndicator size="small" color={palette.surfaceFeature} />
            ) : (
              <Text style={[styles.connectButtonText, { color: palette.surfaceFeature }]}>
                {t.music.miniConnect}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // Sudah login tetapi belum ada lagu aktif
  if (!currentTrack) {
    return (
      <View style={cardSurfaceStyle}>
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={[styles.errorText, { color: palette.accent }]} numberOfLines={1}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.emptyRow}>
          <View style={styles.spotifyMarkWrap}>
            <FontAwesome name="spotify" size={20} color={palette.spotifyGreen} />
          </View>
          <View style={{ flex: 1, minWidth: 0, marginHorizontal: SPACING.md }}>
            <Text style={[styles.kickerInverse, { color: palette.onFeatureMuted }]}>
              {t.music.miniReadyKicker}
            </Text>
            <Text
              style={[styles.emptySubtitle, { color: palette.onFeature }]}
              numberOfLines={1}
            >
              {activeDevice
                ? t.music.miniActiveIn(activeDevice.name)
                : t.music.miniTapToPlay}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.music.miniPlayA11y}
            style={({ pressed }) => [
              styles.paperCirclePlay,
              { backgroundColor: palette.onFeature },
              pressed && { opacity: 0.78 },
            ]}
            onPress={togglePlay}
            disabled={isPlayerLoading}
          >
            {isPlayerLoading ? (
              <ActivityIndicator size="small" color={palette.surfaceFeature} />
            ) : (
              <Play size={16} strokeWidth={2} color={palette.surfaceFeature} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.music.miniSelectDeviceA11y}
            style={({ pressed }) => [styles.devicesButton, pressed && { opacity: 0.7 }]}
            onPress={() => {
              refreshDevices();
              setDeviceModalVisible(true);
            }}
          >
            <Cpu size={16} strokeWidth={2} color={palette.onFeature} />
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

  const mediaMeta = resolveSpotifyMediaMeta(currentTrack, 'Unknown Artist');
  const albumImageUrl = mediaMeta.artworkUrl;
  const artistNames = mediaMeta.subtitle;

  return (
    <View style={cardSurfaceStyle}>
      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={[styles.errorText, { color: palette.accent }]} numberOfLines={1}>
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
            <Music size={20} strokeWidth={2} color={palette.onFeatureMuted} />
          )}
        </View>

        {/* Track & Artist Info */}
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, { color: palette.onFeature }]} numberOfLines={1}>
            {currentTrack.name}
          </Text>
          <Text
            style={[styles.trackArtist, { color: palette.onFeatureMuted }]}
            numberOfLines={1}
          >
            {artistNames}
          </Text>
          <View style={styles.deviceRow}>
            <SpotifyAttribution size="small" variant="dark" />
            {activeDevice && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.music.miniActiveDeviceA11y(activeDevice.name)}
                onPress={() => {
                  refreshDevices();
                  setDeviceModalVisible(true);
                }}
                style={({ pressed }) => [styles.deviceIndicator, pressed && { opacity: 0.7 }]}
              >
                <Volume2 size={12} strokeWidth={2} color={palette.spotifyGreen} />
                <Text
                  style={[styles.deviceName, { color: palette.onFeature }]}
                  numberOfLines={1}
                >
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
            accessibilityLabel={t.music.miniPrevA11y}
            onPress={previous}
            disabled={isPlayerLoading}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.65 }]}
          >
            <SkipBack size={18} strokeWidth={2} color={palette.onFeature} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? t.music.miniPauseA11y : t.music.miniResumeA11y}
            style={({ pressed }) => [
              styles.paperCirclePlay,
              { backgroundColor: palette.onFeature },
              pressed && { opacity: 0.8 },
            ]}
            onPress={togglePlay}
            disabled={isPlayerLoading}
          >
            {isPlayerLoading ? (
              <ActivityIndicator size="small" color={palette.surfaceFeature} />
            ) : isPlaying ? (
              <Pause size={16} strokeWidth={2} color={palette.surfaceFeature} />
            ) : (
              <Play size={16} strokeWidth={2} color={palette.surfaceFeature} />
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.music.miniNextA11y}
            onPress={next}
            disabled={isPlayerLoading}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.65 }]}
          >
            <SkipForward size={18} strokeWidth={2} color={palette.onFeature} />
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
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.lg,
  },
  kickerInverse: {
    ...TYPOGRAPHY.caption,
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
  },
  trackArtist: {
    ...TYPOGRAPHY.bodySm,
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
    maxWidth: 100,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paperCirclePlay: {
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
  },
  connectButton: {
    height: 36,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButtonText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptySubtitle: {
    ...TYPOGRAPHY.bodySm,
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
