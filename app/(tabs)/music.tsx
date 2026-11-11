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
  Alert,
  Modal,
  TextInput,
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
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer';
import { getUserPlaylists, playMusic } from '@/services/spotify/player';
import { SpotifyPlaylist } from '@/types/spotify';
import {
  FONT_FAMILY,
  PALETTE,
  RADIUS,
  SPACING,
  SPOTIFY_GREEN,
  TYPOGRAPHY,
} from '@/constants/Colors';
import { SpotifyAttribution } from '@/components/spotify/SpotifyAttribution';
import { DevicePickerModal } from '@/components/spotify/DevicePickerModal';
import {
  IconCircleButton,
  KickerText,
  TopAppBar,
} from '@/components/ui/EditorialPrimitives';
import { SPOTIFY_CONFIG } from '@/constants/Config';

export default function MusicScreen() {
  const insets = useSafeAreaInsets();
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
  const [pastedLink, setPastedLink] = useState('');

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
        const target =
          devices.find((d) => d.is_active) ||
          devices.find((d) => d.type === 'Smartphone') ||
          devices[0];
        targetDeviceId = target?.id;
      }
      await playMusic({ contextUri: playlist.uri, deviceId: targetDeviceId || undefined });
    } catch (err: any) {
      Alert.alert(
        'Pemutaran Playlist',
        err.message ||
          'Tidak dapat memutar playlist. Pastikan aplikasi Spotify aktif di perangkat Anda.',
        [
          { text: 'Tutup', style: 'cancel' },
          { text: 'Bangunkan Spotify', onPress: wakeUpSpotify },
        ]
      );
    }
  };

  const handleLogout = () => {
    Alert.alert('Keluar dari Spotify', 'Apakah Anda ingin memutuskan koneksi Spotify?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Keluar',
        style: 'destructive',
        onPress: async () => {
          setPlaylists([]);
          await logout();
        },
      },
    ]);
  };

  // TAMPILAN BELUM LOGIN
  if (!isAuthenticated) {
    const isClientIdConfigured = !!SPOTIFY_CONFIG.clientId;
    const topPad = Math.max(insets.top, 16) + 16;

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.notAuthContent, { paddingTop: topPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.emblemCard}>
          <FontAwesome name="spotify" size={44} color={SPOTIFY_GREEN} />
        </View>

        <KickerText style={{ marginTop: 22 }}>AUDIO PENDAMPING LARI</KickerText>
        <Text style={styles.heroTitle}>Koneksikan Spotify</Text>
        <Text style={styles.heroSubtitle}>
          Dengarkan playlist favorit langsung dari HUD lari tanpa berpindah aplikasi saat berolahraga.
        </Text>

        {!isClientIdConfigured && (
          <View style={styles.noticeCard}>
            <AlertTriangle size={18} strokeWidth={2} color={PALETTE.accent} />
            <Text style={styles.noticeText}>
              Client ID belum diisi. Masukkan Spotify Client ID pada file .env (EXPO_PUBLIC_SPOTIFY_CLIENT_ID) lalu restart aplikasi.
            </Text>
          </View>
        )}

        {authError ? (
          <View style={styles.noticeCard}>
            <View style={styles.emberDot} />
            <Text style={styles.noticeText}>{authError}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.loginButton,
            !isClientIdConfigured && { opacity: 0.55 },
            pressed && { opacity: 0.86 },
          ]}
          onPress={login}
          disabled={isAuthLoading || !isClientIdConfigured}
        >
          {isAuthLoading ? (
            <ActivityIndicator color={PALETTE.surfaceRaised} />
          ) : (
            <>
              <FontAwesome name="spotify" size={20} color={PALETTE.surfaceRaised} />
              <Text style={styles.loginButtonText}>Masuk dengan Spotify</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.pasteLinkPrompt, pressed && { opacity: 0.72 }]}
          onPress={() => setManualModalVisible(true)}
        >
          <Link2 size={15} strokeWidth={2} color={PALETTE.onSurfaceVariant} />
          <Text style={styles.pasteLinkPromptText}>
            Tombol &quot;Return to the app&quot; macet? Tempel link di sini
          </Text>
        </Pressable>

        <Modal visible={manualModalVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.manualModalCard}>
              <KickerText>OTENTIKASI MANUAL</KickerText>
              <Text style={styles.manualModalTitle}>Selesaikan Login Manual</Text>
              <Text style={styles.manualModalDesc}>
                Jika browser tidak otomatis kembali ke app:
                {'\n'}1. Tekan &amp; tahan tombol &quot;Return to the app&quot;.
                {'\n'}2. Pilih &quot;Copy link address&quot;.
                {'\n'}3. Tempel link tersebut di bawah ini:
              </Text>

              <TextInput
                style={styles.manualInput}
                value={pastedLink}
                onChangeText={setPastedLink}
                placeholder="Tempel link yang disalin di sini..."
                placeholderTextColor={PALETTE.onSurfaceVariant}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.manualModalActions}>
                <Pressable
                  style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.75 }]}
                  onPress={() => {
                    setManualModalVisible(false);
                    setPastedLink('');
                  }}
                >
                  <Text style={styles.cancelBtnText}>Batal</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.submitBtn,
                    !pastedLink.trim() && { opacity: 0.5 },
                    pressed && { opacity: 0.85 },
                  ]}
                  disabled={!pastedLink.trim() || isAuthLoading}
                  onPress={async () => {
                    if (!pastedLink.trim()) return;
                    const res = await completeManualAuth(pastedLink.trim());
                    if (res.success) {
                      setManualModalVisible(false);
                      setPastedLink('');
                      Alert.alert('Sukses', 'Akun Spotify Anda berhasil terhubung.');
                    } else {
                      Alert.alert(
                        'Gagal Login',
                        res.error || 'Terjadi kesalahan saat memproses link.'
                      );
                    }
                  }}
                >
                  {isAuthLoading ? (
                    <ActivityIndicator size="small" color={PALETTE.surface} />
                  ) : (
                    <Text style={styles.submitBtnText}>Selesaikan</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.featuresCard}>
          <View style={styles.featureItem}>
            <View style={styles.featureIconCircle}>
              <ShieldCheck size={17} strokeWidth={2} color={PALETTE.onSurface} />
            </View>
            <Text style={styles.featureText}>
              Autentikasi aman via PKCE (tanpa menyimpan password atau secret).
            </Text>
          </View>

          <View style={styles.hairline} />

          <View style={styles.featureItem}>
            <View style={styles.featureIconCircle}>
              <Smartphone size={17} strokeWidth={2} color={PALETTE.onSurface} />
            </View>
            <Text style={styles.featureText}>
              Terhubung otomatis dengan Spotify Connect di HP atau earphone TWS Anda.
            </Text>
          </View>

          <View style={styles.hairline} />

          <View style={styles.featureItem}>
            <View style={styles.featureIconCircle}>
              <Zap size={17} strokeWidth={2} color={PALETTE.onSurface} />
            </View>
            <Text style={styles.featureText}>
              Kontrol play, pause, dan skip langsung dari layar lari Anda.
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
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <TopAppBar
        kicker={isPremium ? 'SPOTIFY PREMIUM' : 'SPOTIFY FREE'}
        title={user?.display_name || 'Pengguna Spotify'}
        avatarUrl={user?.images?.[0]?.url}
        rightActions={
          <>
            <IconCircleButton
              accessibilityLabel="Muat ulang perangkat dan playlist"
              icon={<RefreshCw size={17} strokeWidth={2} color={PALETTE.onSurface} />}
              onPress={() => {
                refreshDevices();
                loadPlaylists();
              }}
            />
            <IconCircleButton
              accessibilityLabel="Keluar dari Spotify"
              icon={<LogOut size={17} strokeWidth={2} color={PALETTE.onSurface} />}
              onPress={handleLogout}
            />
          </>
        }
      />

      {!isPremium && (
        <View style={styles.freeNoticeBox}>
          <Info size={16} strokeWidth={2} color={PALETTE.onSurfaceVariant} />
          <Text style={styles.freeNoticeText}>
            Akun Free dibatasi oleh Spotify Web API untuk kontrol playback langsung, namun lagu yang sedang diputar tetap ditampilkan di HUD lari.
          </Text>
        </View>
      )}

      {/* Perangkat Spotify Connect */}
      <View style={styles.deviceCard}>
        <View style={styles.deviceCardHeader}>
          <View style={styles.deviceLabelRow}>
            <Speaker size={15} strokeWidth={2} color={PALETTE.onSurface} />
            <KickerText>PERANGKAT SPOTIFY CONNECT</KickerText>
          </View>

          <Pressable
            style={({ pressed }) => [styles.switchDeviceBtn, pressed && { opacity: 0.78 }]}
            onPress={() => {
              refreshDevices();
              setDeviceModalVisible(true);
            }}
          >
            <Text style={styles.switchDeviceBtnText}>Ganti</Text>
          </Pressable>
        </View>

        <View style={styles.deviceNameRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: activeDevice ? SPOTIFY_GREEN : PALETTE.onSurfaceVariant },
            ]}
          />
          <Text style={styles.activeDeviceName} numberOfLines={1}>
            {activeDevice ? activeDevice.name : 'Tidak ada perangkat aktif'}
          </Text>
        </View>

        <Text style={styles.activeDeviceDesc}>
          {activeDevice
            ? `Tipe: ${activeDevice.type} • Status: Aktif`
            : 'Aplikasi Spotify di HP belum terhubung ke Spotify Connect.'}
        </Text>

        {!activeDevice && (
          <Pressable
            style={({ pressed }) => [styles.wakeUpBtn, pressed && { opacity: 0.85 }]}
            onPress={wakeUpSpotify}
          >
            <Zap size={14} strokeWidth={2} color={PALETTE.surface} />
            <Text style={styles.wakeUpBtnText}>Bangunkan Spotify (1-Klik)</Text>
          </Pressable>
        )}
      </View>

      {/* Kartu Now Playing (Dark Ink Surface) */}
      <View style={styles.nowPlayingCard}>
        <View style={styles.nowPlayingHeader}>
          <KickerText inverse>SEDANG DIPUTAR</KickerText>
          <SpotifyAttribution size="small" variant="dark" />
        </View>

        {playerError ? (
          <View style={styles.playerErrorBox}>
            <View style={styles.emberDot} />
            <Text style={styles.playerErrorText}>{playerError}</Text>
          </View>
        ) : null}

        {currentTrack ? (
          <View style={styles.playerMain}>
            {albumImage ? (
              <Image source={{ uri: albumImage }} style={styles.nowPlayingArt} resizeMode="cover" />
            ) : (
              <View style={[styles.nowPlayingArt, styles.nowPlayingArtPlaceholder]}>
                <Music size={36} strokeWidth={2} color={PALETTE.onInverseMuted} />
              </View>
            )}

            <Text style={styles.nowPlayingTrackTitle} numberOfLines={1}>
              {currentTrack.name}
            </Text>
            <Text style={styles.nowPlayingTrackArtist} numberOfLines={1}>
              {currentTrack.artists?.map((a) => a.name).join(', ')}
            </Text>

            <View style={styles.playbackControls}>
              <Pressable
                onPress={previous}
                disabled={isPlayerLoading}
                style={({ pressed }) => [styles.ctrlBtn, pressed && { opacity: 0.72 }]}
              >
                <SkipBack size={22} strokeWidth={2} color={PALETTE.onInverse} />
              </Pressable>

              <Pressable
                onPress={togglePlay}
                disabled={isPlayerLoading}
                style={({ pressed }) => [
                  styles.mainPlayBtn,
                  pressed && { backgroundColor: PALETTE.primaryDeep },
                ]}
              >
                {isPlayerLoading ? (
                  <ActivityIndicator color={PALETTE.onPrimary} />
                ) : isPlaying ? (
                  <Pause size={26} strokeWidth={2} color={PALETTE.onPrimary} />
                ) : (
                  <Play
                    size={26}
                    strokeWidth={2}
                    color={PALETTE.onPrimary}
                    style={{ marginLeft: 2 }}
                  />
                )}
              </Pressable>

              <Pressable
                onPress={next}
                disabled={isPlayerLoading}
                style={({ pressed }) => [styles.ctrlBtn, pressed && { opacity: 0.72 }]}
              >
                <SkipForward size={22} strokeWidth={2} color={PALETTE.onInverse} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.idlePlayer}>
            <View style={styles.idleArtIcon}>
              <Disc3 size={34} strokeWidth={1.8} color={PALETTE.onInverseMuted} />
            </View>
            <Text style={styles.idlePlayerText}>Tidak ada musik yang sedang diputar</Text>
            <Text style={styles.idlePlayerSub}>
              Pilih playlist di bawah atau putar langsung dari Spotify
            </Text>
            {!activeDevice && (
              <Pressable
                style={({ pressed }) => [styles.wakeUpInverseBtn, pressed && { opacity: 0.85 }]}
                onPress={wakeUpSpotify}
              >
                <Zap size={14} strokeWidth={2} color={PALETTE.onSurface} />
                <Text style={styles.wakeUpInverseBtnText}>Bangunkan Spotify di HP</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Koleksi Playlist */}
      <View style={styles.sectionHeader}>
        <View>
          <KickerText>KOLEKSI ANDA</KickerText>
          <Text style={styles.sectionTitle}>Playlist Lari</Text>
        </View>
        <IconCircleButton
          accessibilityLabel="Muat ulang playlist"
          icon={<RefreshCw size={16} strokeWidth={2} color={PALETTE.onSurface} />}
          onPress={loadPlaylists}
        />
      </View>

      {isLoadingPlaylists ? (
        <ActivityIndicator color={PALETTE.onSurface} style={{ marginVertical: 24 }} />
      ) : playlists.length === 0 ? (
        <View style={styles.emptyPlaylists}>
          <Text style={styles.emptyPlaylistsText}>Tidak ada playlist ditemukan.</Text>
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
                style={({ pressed }) => [styles.playlistCard, pressed && { opacity: 0.84 }]}
                onPress={() => handlePlayPlaylist(item)}
              >
                {img ? (
                  <Image source={{ uri: img }} style={styles.playlistImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.playlistImage, styles.playlistImagePlaceholder]}>
                    <Music size={24} strokeWidth={2} color={PALETTE.onSurfaceVariant} />
                  </View>
                )}
                <Text style={styles.playlistName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.playlistTrackCount}>
                  {item.tracks?.total ? `${item.tracks.total} lagu` : 'Playlist'}
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
    backgroundColor: PALETTE.surface,
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
    backgroundColor: PALETTE.surfaceInverse,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.84,
    color: PALETTE.onSurface,
    marginTop: 8,
    marginBottom: 10,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...TYPOGRAPHY.bodyMd,
    color: PALETTE.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    padding: 14,
    marginBottom: 16,
    width: '100%',
  },
  noticeText: {
    ...TYPOGRAPHY.bodyMd,
    lineHeight: 19,
    color: PALETTE.onSurface,
    flex: 1,
  },
  emberDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PALETTE.accent,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: SPOTIFY_GREEN,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: RADIUS.full,
    width: '100%',
    minHeight: 54,
  },
  loginButtonText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    color: PALETTE.surfaceRaised,
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
    color: PALETTE.onSurfaceVariant,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  featuresCard: {
    marginTop: 22,
    width: '100%',
    backgroundColor: PALETTE.surfaceAlt,
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
    backgroundColor: PALETTE.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    ...TYPOGRAPHY.bodyMd,
    lineHeight: 19,
    color: PALETTE.onSurface,
    flex: 1,
  },
  hairline: {
    height: 1,
    backgroundColor: PALETTE.border,
  },
  attributionFooter: {
    marginTop: 24,
  },
  // Manual modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(14, 15, 12, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.gutter,
  },
  manualModalCard: {
    width: '100%',
    backgroundColor: PALETTE.surface,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: 22,
  },
  manualModalTitle: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: PALETTE.onSurface,
    marginTop: 6,
    marginBottom: 8,
  },
  manualModalDesc: {
    ...TYPOGRAPHY.bodyMd,
    lineHeight: 20,
    color: PALETTE.onSurfaceVariant,
    marginBottom: 16,
  },
  manualInput: {
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONT_FAMILY.bodyRegular,
    fontSize: 13,
    color: PALETTE.onSurface,
    marginBottom: 18,
  },
  manualModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: RADIUS.full,
    backgroundColor: PALETTE.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 14,
    color: PALETTE.onSurface,
  },
  submitBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: RADIUS.full,
    backgroundColor: PALETTE.surfaceInverse,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 14,
    color: PALETTE.surface,
  },
  // Authenticated
  freeNoticeBox: {
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.md,
    backgroundColor: PALETTE.surfaceAlt,
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
    color: PALETTE.onSurfaceVariant,
    flex: 1,
  },
  deviceCard: {
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.sectionGap,
    backgroundColor: PALETTE.surfaceAlt,
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
    backgroundColor: PALETTE.surfaceRaised,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
  },
  switchDeviceBtnText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 12,
    color: PALETTE.onSurface,
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
    color: PALETTE.onSurface,
    flex: 1,
  },
  activeDeviceDesc: {
    ...TYPOGRAPHY.bodySm,
    lineHeight: 17,
    color: PALETTE.onSurfaceVariant,
    marginTop: 4,
  },
  wakeUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: PALETTE.surfaceInverse,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  wakeUpBtnText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 12,
    color: PALETTE.surface,
  },
  // Now Playing Dark Ink Card
  nowPlayingCard: {
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.sectionGap,
    backgroundColor: PALETTE.surfaceInverse,
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
    backgroundColor: '#1B1C18',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  playerErrorText: {
    ...TYPOGRAPHY.bodySm,
    lineHeight: 17,
    color: PALETTE.onInverse,
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
    backgroundColor: '#1B1C18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nowPlayingTrackTitle: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: PALETTE.onInverse,
    textAlign: 'center',
    marginBottom: 4,
  },
  nowPlayingTrackArtist: {
    ...TYPOGRAPHY.bodyMd,
    color: PALETTE.onInverseMuted,
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
    backgroundColor: '#1B1C18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainPlayBtn: {
    width: 68,
    height: 68,
    borderRadius: RADIUS.full,
    backgroundColor: PALETTE.primary,
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
    backgroundColor: '#1B1C18',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  idlePlayerText: {
    ...TYPOGRAPHY.headlineMd,
    color: PALETTE.onInverse,
    textAlign: 'center',
  },
  idlePlayerSub: {
    ...TYPOGRAPHY.bodyMd,
    color: PALETTE.onInverseMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  wakeUpInverseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: RADIUS.full,
  },
  wakeUpInverseBtnText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 12,
    color: PALETTE.onPrimary,
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
    color: PALETTE.onSurface,
    marginTop: 4,
  },
  playlistCarousel: {
    paddingHorizontal: SPACING.gutter,
    gap: SPACING.md,
  },
  playlistCard: {
    width: 152,
    backgroundColor: PALETTE.surfaceRaised,
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
    backgroundColor: PALETTE.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistName: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: PALETTE.onSurface,
  },
  playlistTrackCount: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    color: PALETTE.onSurfaceVariant,
    marginTop: 3,
  },
  emptyPlaylists: {
    marginHorizontal: SPACING.gutter,
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.lg,
    padding: 24,
    alignItems: 'center',
  },
  emptyPlaylistsText: {
    ...TYPOGRAPHY.bodyMd,
    color: PALETTE.onSurfaceVariant,
  },
});
