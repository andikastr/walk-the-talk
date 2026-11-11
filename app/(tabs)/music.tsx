import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import {
  AlertTriangle,
  Disc3,
  Info,
  Link2,
  LogOut,
  Music,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Smartphone,
  Speaker,
  Zap,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { useSpotifyPlayer, useSpotifyPlayerFocus } from '@/hooks/useSpotifyPlayer';
import { getUserPlaylists, playMusic } from '@/services/spotify/player';
import { SpotifyPlaylist } from '@/types/spotify';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';
import { useAppDialog } from '@/context/AppDialogContext';
import { SpotifyAttribution } from '@/components/spotify/SpotifyAttribution';
import { DevicePickerModal } from '@/components/spotify/DevicePickerModal';
import { SpotifyManualAuthModal } from '@/components/spotify/SpotifyManualAuthModal';
import {
  IconCircleButton,
  KickerText,
  TopAppBar,
} from '@/components/ui/EditorialPrimitives';
import { SPOTIFY_CONFIG } from '@/constants/Config';

export default function MusicScreen() {
  const insets = useSafeAreaInsets();
  const { palette, isDark, t } = usePreferences();
  const { alert, confirm, showDialog } = useAppDialog();
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    user,
    login,
    completeManualAuth,
    logout,
    error: authError,
  } = useSpotifyAuth();

  const [manualModalVisible, setManualModalVisible] = useState(false);

  const {
    currentTrack,
    isPlaying,
    activeDevice,
    devices,
    isLoading: isPlayerLoading,
    errorMessage: playerError,
    togglePlay,
    next,
    previous,
    refreshDevices,
    selectDevice,
    wakeUpSpotify,
  } = useSpotifyPlayer();

  useSpotifyPlayerFocus();

  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [deviceModalVisible, setDeviceModalVisible] = useState(false);

  const loadPlaylists = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setIsLoadingPlaylists(true);
      const items = await getUserPlaylists(15);
      setPlaylists(items);
    } catch (err: any) {
      console.warn('Gagal memuat playlist Spotify:', err.message);
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let isMounted = true;
    if (isAuthenticated) {
      (async () => {
        try {
          setIsLoadingPlaylists(true);
          const items = await getUserPlaylists(15);
          if (isMounted) setPlaylists(items);
        } catch (err: any) {
          console.warn('Gagal memuat playlist Spotify:', err.message);
        } finally {
          if (isMounted) setIsLoadingPlaylists(false);
        }
      })();
    }
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const handlePlayPlaylist = async (playlist: SpotifyPlaylist) => {
    try {
      let targetDeviceId = activeDevice?.id;
      if (!targetDeviceId) {
        const availableDevices = devices.length > 0 ? devices : await refreshDevices();
        const target =
          availableDevices.find((d) => d.is_active) ||
          availableDevices.find((d) => d.type === 'Smartphone') ||
          availableDevices[0];
        targetDeviceId = target?.id;
      }
      await playMusic({ contextUri: playlist.uri, deviceId: targetDeviceId || undefined });
    } catch (err: any) {
      const picked = await showDialog({
        kicker: t.common.warningKicker,
        title: t.music.playlistErrorTitle,
        message: err?.message || t.music.playlistErrorDefault,
        tone: 'error',
        actions: [
          { id: 'close', label: t.common.close, variant: 'secondary' },
          { id: 'wake', label: t.music.wakeSpotifyAction, variant: 'primary' },
        ],
      });
      if (picked === 'wake') {
        await wakeUpSpotify();
      }
    }
  };

  const handleLogout = async () => {
    const confirmed = await confirm({
      kicker: t.common.warningKicker,
      title: t.music.logoutTitle,
      message: t.music.logoutMessage,
      cancelText: t.common.cancel,
      confirmText: t.music.logoutAction,
      destructive: true,
    });
    if (confirmed) {
      setPlaylists([]);
      await logout();
    }
  };

  const darkSurfaceBorder = isDark ? { borderWidth: 1, borderColor: palette.border } : undefined;

  // TAMPILAN BELUM LOGIN
  if (!isAuthenticated) {
    const isClientIdConfigured = !!SPOTIFY_CONFIG.clientId;
    const topPad = Math.max(insets.top, 16) + 16;

    return (
      <ScrollView
        style={[styles.container, { backgroundColor: palette.surface }]}
        contentContainerStyle={[styles.notAuthContent, { paddingTop: topPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.emblemCard,
            { backgroundColor: palette.surfaceFeature },
            darkSurfaceBorder,
          ]}
        >
          <FontAwesome name="spotify" size={44} color={palette.spotifyGreen} />
        </View>

        <KickerText style={{ marginTop: 22 }}>{t.music.unauthKicker}</KickerText>
        <Text style={[styles.heroTitle, { color: palette.onSurface }]}>
          {t.music.unauthTitle}
        </Text>
        <Text style={[styles.heroSubtitle, { color: palette.onSurfaceVariant }]}>
          {t.music.unauthSubtitle}
        </Text>

        {!isClientIdConfigured && (
          <View
            style={[
              styles.noticeCard,
              { backgroundColor: palette.surfaceAlt },
              darkSurfaceBorder,
            ]}
          >
            <AlertTriangle size={18} strokeWidth={2} color={palette.accent} />
            <Text style={[styles.noticeText, { color: palette.onSurface }]}>
              {t.music.missingClientId}
            </Text>
          </View>
        )}

        {authError ? (
          <View
            style={[
              styles.noticeCard,
              { backgroundColor: palette.surfaceAlt },
              darkSurfaceBorder,
            ]}
          >
            <View style={[styles.emberDot, { backgroundColor: palette.accent }]} />
            <Text style={[styles.noticeText, { color: palette.onSurface }]}>{authError}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.loginButton,
            { backgroundColor: palette.spotifyGreen },
            !isClientIdConfigured && { opacity: 0.55 },
            pressed && { opacity: 0.86 },
          ]}
          onPress={login}
          disabled={isAuthLoading || !isClientIdConfigured}
        >
          {isAuthLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <FontAwesome name="spotify" size={20} color="#FFFFFF" />
              <Text style={styles.loginButtonText}>{t.music.loginBtn}</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.pasteLinkPrompt, pressed && { opacity: 0.72 }]}
          onPress={() => setManualModalVisible(true)}
        >
          <Link2 size={15} strokeWidth={2} color={palette.onSurfaceVariant} />
          <Text style={[styles.pasteLinkPromptText, { color: palette.onSurfaceVariant }]}>
            {t.music.manualPrompt}
          </Text>
        </Pressable>

        <SpotifyManualAuthModal
          visible={manualModalVisible}
          isSubmitting={isAuthLoading}
          onClose={() => setManualModalVisible(false)}
          onSubmitUrl={completeManualAuth}
          onSuccess={() => {
            void alert({
              kicker: t.common.successKicker,
              title: t.music.manualSuccessTitle,
              message: t.music.manualSuccessMessage,
              tone: 'success',
            });
          }}
        />

        <View
          style={[
            styles.featuresCard,
            { backgroundColor: palette.surfaceAlt },
            darkSurfaceBorder,
          ]}
        >
          <View style={styles.featureItem}>
            <View
              style={[
                styles.featureIconCircle,
                { backgroundColor: palette.surfaceRaised },
                darkSurfaceBorder,
              ]}
            >
              <ShieldCheck size={17} strokeWidth={2} color={palette.onSurface} />
            </View>
            <Text style={[styles.featureText, { color: palette.onSurface }]}>
              {t.music.featurePkce}
            </Text>
          </View>

          <View style={[styles.hairline, { backgroundColor: palette.border }]} />

          <View style={styles.featureItem}>
            <View
              style={[
                styles.featureIconCircle,
                { backgroundColor: palette.surfaceRaised },
                darkSurfaceBorder,
              ]}
            >
              <Smartphone size={17} strokeWidth={2} color={palette.onSurface} />
            </View>
            <Text style={[styles.featureText, { color: palette.onSurface }]}>
              {t.music.featureConnect}
            </Text>
          </View>

          <View style={[styles.hairline, { backgroundColor: palette.border }]} />

          <View style={styles.featureItem}>
            <View
              style={[
                styles.featureIconCircle,
                { backgroundColor: palette.surfaceRaised },
                darkSurfaceBorder,
              ]}
            >
              <Zap size={17} strokeWidth={2} color={palette.onSurface} />
            </View>
            <Text style={[styles.featureText, { color: palette.onSurface }]}>
              {t.music.featureControls}
            </Text>
          </View>
        </View>

        <View style={styles.attributionFooter}>
          <SpotifyAttribution size="medium" variant="light" />
        </View>
      </ScrollView>
    );
  }

  // TAMPILAN SUDAH LOGIN
  const isPremium = user?.product === 'premium';
  const albumImage = currentTrack?.album?.images?.[0]?.url;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.surface }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <TopAppBar
        kicker={isPremium ? 'SPOTIFY PREMIUM' : 'SPOTIFY FREE'}
        title={user?.display_name || t.music.defaultUserName}
        avatarUrl={user?.images?.[0]?.url}
        rightActions={
          <>
            <IconCircleButton
              accessibilityLabel={t.music.refreshA11y}
              icon={<RefreshCw size={17} strokeWidth={2} color={palette.onSurface} />}
              onPress={() => {
                refreshDevices();
                loadPlaylists();
              }}
            />
            <IconCircleButton
              accessibilityLabel={t.music.logoutA11y}
              icon={<LogOut size={17} strokeWidth={2} color={palette.onSurface} />}
              onPress={() => void handleLogout()}
            />
          </>
        }
      />

      {!isPremium && (
        <View
          style={[
            styles.freeNoticeBox,
            { backgroundColor: palette.surfaceAlt },
            darkSurfaceBorder,
          ]}
        >
          <Info size={16} strokeWidth={2} color={palette.onSurfaceVariant} />
          <Text style={[styles.freeNoticeText, { color: palette.onSurfaceVariant }]}>
            {t.music.freeNotice}
          </Text>
        </View>
      )}

      {/* Perangkat Spotify Connect */}
      <View
        style={[
          styles.deviceCard,
          { backgroundColor: palette.surfaceAlt },
          darkSurfaceBorder,
        ]}
      >
        <View style={styles.deviceCardHeader}>
          <View style={styles.deviceLabelRow}>
            <Speaker size={15} strokeWidth={2} color={palette.onSurface} />
            <KickerText>{t.music.deviceKicker}</KickerText>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.switchDeviceBtn,
              { backgroundColor: palette.surfaceRaised },
              darkSurfaceBorder,
              pressed && { opacity: 0.78 },
            ]}
            onPress={() => {
              refreshDevices();
              setDeviceModalVisible(true);
            }}
          >
            <Text style={[styles.switchDeviceBtnText, { color: palette.onSurface }]}>
              {t.music.switchDevice}
            </Text>
          </Pressable>
        </View>

        <View style={styles.deviceNameRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: activeDevice
                  ? palette.spotifyGreen
                  : palette.onSurfaceVariant,
              },
            ]}
          />
          <Text
            style={[styles.activeDeviceName, { color: palette.onSurface }]}
            numberOfLines={1}
          >
            {activeDevice ? activeDevice.name : t.music.noActiveDevice}
          </Text>
        </View>

        <Text style={[styles.activeDeviceDesc, { color: palette.onSurfaceVariant }]}>
          {activeDevice
            ? t.music.deviceDetails(activeDevice.type)
            : t.music.deviceInactiveHint}
        </Text>

        {!activeDevice && (
          <Pressable
            style={({ pressed }) => [
              styles.wakeUpBtn,
              { backgroundColor: palette.actionPrimary },
              pressed && { opacity: 0.85 },
            ]}
            onPress={wakeUpSpotify}
          >
            <Zap size={14} strokeWidth={2} color={palette.onActionPrimary} />
            <Text style={[styles.wakeUpBtnText, { color: palette.onActionPrimary }]}>
              {t.music.wakeUpBtn}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Kartu Now Playing (Dark Ink Surface) */}
      <View
        style={[
          styles.nowPlayingCard,
          { backgroundColor: palette.surfaceFeature },
          darkSurfaceBorder,
        ]}
      >
        <View style={styles.nowPlayingHeader}>
          <KickerText inverse>{t.music.nowPlayingKicker}</KickerText>
          <SpotifyAttribution size="small" variant="dark" />
        </View>

        {playerError ? (
          <View
            style={[
              styles.playerErrorBox,
              { backgroundColor: palette.surfaceFeatureElevated },
            ]}
          >
            <View style={[styles.emberDot, { backgroundColor: palette.accent }]} />
            <Text style={[styles.playerErrorText, { color: palette.onFeature }]}>
              {playerError}
            </Text>
          </View>
        ) : null}

        {currentTrack ? (
          <View style={styles.playerMain}>
            {albumImage ? (
              <Image source={{ uri: albumImage }} style={styles.nowPlayingArt} resizeMode="cover" />
            ) : (
              <View
                style={[
                  styles.nowPlayingArt,
                  styles.nowPlayingArtPlaceholder,
                  { backgroundColor: palette.surfaceFeatureElevated },
                ]}
              >
                <Music size={36} strokeWidth={2} color={palette.onFeatureMuted} />
              </View>
            )}

            <Text
              style={[styles.nowPlayingTrackTitle, { color: palette.onFeature }]}
              numberOfLines={1}
            >
              {currentTrack.name}
            </Text>
            <Text
              style={[styles.nowPlayingTrackArtist, { color: palette.onFeatureMuted }]}
              numberOfLines={1}
            >
              {currentTrack.artists?.map((a) => a.name).join(', ')}
            </Text>

            <View style={styles.playbackControls}>
              <Pressable
                onPress={previous}
                disabled={isPlayerLoading}
                style={({ pressed }) => [
                  styles.ctrlBtn,
                  { backgroundColor: palette.surfaceFeatureElevated },
                  pressed && { opacity: 0.72 },
                ]}
              >
                <SkipBack size={22} strokeWidth={2} color={palette.onFeature} />
              </Pressable>

              <Pressable
                onPress={togglePlay}
                disabled={isPlayerLoading}
                style={({ pressed }) => [
                  styles.mainPlayBtn,
                  { backgroundColor: pressed ? palette.primaryDeep : palette.primary },
                ]}
              >
                {isPlayerLoading ? (
                  <ActivityIndicator color={palette.onPrimary} />
                ) : isPlaying ? (
                  <Pause size={26} strokeWidth={2} color={palette.onPrimary} />
                ) : (
                  <Play
                    size={26}
                    strokeWidth={2}
                    color={palette.onPrimary}
                    style={{ marginLeft: 2 }}
                  />
                )}
              </Pressable>

              <Pressable
                onPress={next}
                disabled={isPlayerLoading}
                style={({ pressed }) => [
                  styles.ctrlBtn,
                  { backgroundColor: palette.surfaceFeatureElevated },
                  pressed && { opacity: 0.72 },
                ]}
              >
                <SkipForward size={22} strokeWidth={2} color={palette.onFeature} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.idlePlayer}>
            <View
              style={[
                styles.idleArtIcon,
                { backgroundColor: palette.surfaceFeatureElevated },
              ]}
            >
              <Disc3 size={34} strokeWidth={1.8} color={palette.onFeatureMuted} />
            </View>
            <Text style={[styles.idlePlayerText, { color: palette.onFeature }]}>
              {t.music.nothingPlaying}
            </Text>
            <Text style={[styles.idlePlayerSub, { color: palette.onFeatureMuted }]}>
              {t.music.nothingPlayingSub}
            </Text>
            {!activeDevice && (
              <Pressable
                style={({ pressed }) => [
                  styles.wakeUpInverseBtn,
                  { backgroundColor: palette.primary },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={wakeUpSpotify}
              >
                <Zap size={14} strokeWidth={2} color={palette.onPrimary} />
                <Text style={[styles.wakeUpInverseBtnText, { color: palette.onPrimary }]}>
                  {t.music.wakeUpInverseBtn}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Koleksi Playlist */}
      <View style={styles.sectionHeader}>
        <View>
          <KickerText>{t.music.collectionKicker}</KickerText>
          <Text style={[styles.sectionTitle, { color: palette.onSurface }]}>
            {t.music.playlistsHeading}
          </Text>
        </View>
        <IconCircleButton
          accessibilityLabel={t.music.refreshPlaylistA11y}
          icon={<RefreshCw size={16} strokeWidth={2} color={palette.onSurface} />}
          onPress={loadPlaylists}
        />
      </View>

      {isLoadingPlaylists ? (
        <ActivityIndicator color={palette.onSurface} style={{ marginVertical: 24 }} />
      ) : playlists.length === 0 ? (
        <View
          style={[
            styles.emptyPlaylists,
            { backgroundColor: palette.surfaceAlt },
            darkSurfaceBorder,
          ]}
        >
          <Text style={[styles.emptyPlaylistsText, { color: palette.onSurfaceVariant }]}>
            {t.music.emptyPlaylists}
          </Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.playlistCarousel}
          renderItem={({ item }) => {
            const img = item.images?.[0]?.url;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.playlistCard,
                  { backgroundColor: palette.surfaceRaised },
                  darkSurfaceBorder,
                  pressed && { opacity: 0.84 },
                ]}
                onPress={() => void handlePlayPlaylist(item)}
              >
                {img ? (
                  <Image source={{ uri: img }} style={styles.playlistImage} resizeMode="cover" />
                ) : (
                  <View
                    style={[
                      styles.playlistImage,
                      styles.playlistImagePlaceholder,
                      { backgroundColor: palette.surfaceAlt },
                    ]}
                  >
                    <Music size={24} strokeWidth={2} color={palette.onSurfaceVariant} />
                  </View>
                )}
                <Text
                  style={[styles.playlistName, { color: palette.onSurface }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text style={[styles.playlistTrackCount, { color: palette.onSurfaceVariant }]}>
                  {item.tracks?.total
                    ? `${item.tracks.total} ${t.common.tracksUnit}`
                    : t.music.playlistLabel}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      {/* Device Picker Modal */}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 112,
  },
  // Unauthenticated
  notAuthContent: {
    paddingHorizontal: SPACING.gutter,
    paddingBottom: 112,
    alignItems: 'center',
  },
  emblemCard: {
    width: 88,
    height: 88,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.84,
    marginTop: 8,
    marginBottom: 10,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...TYPOGRAPHY.bodyMd,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    padding: 14,
    marginBottom: 16,
    width: '100%',
  },
  noticeText: {
    ...TYPOGRAPHY.bodyMd,
    lineHeight: 19,
    flex: 1,
  },
  emberDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: RADIUS.full,
    width: '100%',
    minHeight: 54,
  },
  loginButtonText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    color: '#FFFFFF',
    fontSize: 15,
    letterSpacing: -0.15,
  },
  pasteLinkPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  pasteLinkPromptText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  featuresCard: {
    marginTop: 22,
    width: '100%',
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  featureIconCircle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    ...TYPOGRAPHY.bodyMd,
    lineHeight: 19,
    flex: 1,
  },
  hairline: {
    height: 1,
  },
  attributionFooter: {
    marginTop: 24,
  },
  // Authenticated
  freeNoticeBox: {
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  freeNoticeText: {
    ...TYPOGRAPHY.bodySm,
    lineHeight: 18,
    flex: 1,
  },
  deviceCard: {
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.sectionGap,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.cardPadding,
  },
  deviceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchDeviceBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
  },
  switchDeviceBtnText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 12,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDeviceName: {
    ...TYPOGRAPHY.headlineMd,
    flex: 1,
  },
  activeDeviceDesc: {
    ...TYPOGRAPHY.bodySm,
    lineHeight: 17,
    marginTop: 4,
  },
  wakeUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  wakeUpBtnText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 12,
  },
  // Now Playing Dark Ink Card
  nowPlayingCard: {
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.sectionGap,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: 22,
  },
  nowPlayingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  playerErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  playerErrorText: {
    ...TYPOGRAPHY.bodySm,
    lineHeight: 17,
    flex: 1,
  },
  playerMain: {
    alignItems: 'center',
  },
  nowPlayingArt: {
    width: 176,
    height: 176,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    marginBottom: 18,
  },
  nowPlayingArtPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  nowPlayingTrackTitle: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 4,
  },
  nowPlayingTrackArtist: {
    ...TYPOGRAPHY.bodyMd,
    textAlign: 'center',
    marginBottom: 22,
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  ctrlBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainPlayBtn: {
    width: 68,
    height: 68,
    borderRadius: RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  idlePlayer: {
    alignItems: 'center',
    paddingVertical: 22,
  },
  idleArtIcon: {
    width: 68,
    height: 68,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  idlePlayerText: {
    ...TYPOGRAPHY.headlineMd,
    textAlign: 'center',
  },
  idlePlayerSub: {
    ...TYPOGRAPHY.bodyMd,
    textAlign: 'center',
    marginTop: 6,
  },
  wakeUpInverseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: RADIUS.full,
  },
  wakeUpInverseBtnText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 12,
  },
  // Playlists Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.gutter,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.4,
    marginTop: 4,
  },
  playlistCarousel: {
    paddingHorizontal: SPACING.gutter,
    gap: SPACING.md,
  },
  playlistCard: {
    width: 152,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: 12,
  },
  playlistImage: {
    width: 128,
    height: 128,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    marginBottom: 10,
  },
  playlistImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistName: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  playlistTrackCount: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    marginTop: 3,
  },
  emptyPlaylists: {
    marginHorizontal: SPACING.gutter,
    borderRadius: RADIUS.lg,
    padding: 24,
    alignItems: 'center',
  },
  emptyPlaylistsText: {
    ...TYPOGRAPHY.bodyMd,
  },
});
