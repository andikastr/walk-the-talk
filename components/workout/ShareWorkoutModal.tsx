import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Share2, Music, Layers, Sparkles } from 'lucide-react-native';
import { WorkoutRecord } from '@/types/workout';
import { formatDuration, formatPace, formatSteps } from '@/services/location/metrics';
import { RouteSilhouette } from '@/components/workout/RouteSilhouette';
import { IconCircleButton } from '@/components/ui/EditorialPrimitives';
import { PALETTE, RADIUS, SPACING, TYPOGRAPHY, FONT_FAMILY } from '@/constants/Colors';

type SharePreset = 'paper' | 'dark' | 'sticker';

interface ShareWorkoutModalProps {
  visible: boolean;
  workout: WorkoutRecord;
  onClose: () => void;
}

const CARD_WIDTH = 316;
const ROUTE_WIDTH = 276;
const ROUTE_HEIGHT = 148;

const PRESETS: { key: SharePreset; label: string }[] = [
  { key: 'paper', label: 'Paper' },
  { key: 'dark', label: 'Dark Ink' },
  { key: 'sticker', label: 'Sticker PNG' },
];

export function ShareWorkoutModal({
  visible,
  workout,
  onClose,
}: ShareWorkoutModalProps) {
  const viewShotRef = useRef<ViewShotRef | null>(null);
  const [preset, setPreset] = useState<SharePreset>('paper');
  const [isSharing, setIsSharing] = useState(false);

  const isDark = preset === 'dark';
  const isSticker = preset === 'sticker';

  const textPrimary = isDark || isSticker ? PALETTE.onInverse : PALETTE.onSurface;
  const textSecondary = isDark || isSticker ? PALETTE.onInverseMuted : PALETTE.onSurfaceVariant;
  const accentHero = isDark || isSticker ? PALETTE.primary : PALETTE.accent;
  const hairlineColor = isDark
    ? 'rgba(244, 242, 236, 0.14)'
    : isSticker
      ? 'rgba(244, 242, 236, 0.25)'
      : PALETTE.border;
  const routeStroke = isDark ? PALETTE.primary : PALETTE.accent;
  const routeStart = PALETTE.surfaceInverse;
  const routeEnd = isDark ? PALETTE.accent : PALETTE.primary;

  const dateLabel = new Date(workout.startTime)
    .toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();

  const handleCaptureAndShare = async () => {
    if (isSharing) return;
    setIsSharing(true);

    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          'Tidak Didukung',
          'Fitur berbagi file belum didukung di perangkat ini.'
        );
        return;
      }

      const uri = await viewShotRef.current?.capture?.();
      if (!uri) {
        Alert.alert('Gagal Membuat Kartu', 'Tidak dapat merender gambar aktivitas.');
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Bagikan Aktivitas',
      });
    } catch {
      Alert.alert(
        'Gagal Membagikan',
        'Terjadi kesalahan saat mengekspor kartu aktivitas.'
      );
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.kicker}>SOCIAL EXPORT · PNG</Text>
              <Text style={styles.sheetTitle}>Bagikan Aktivitas</Text>
            </View>
            <IconCircleButton
              icon="close"
              onPress={onClose}
              accessibilityLabel="Tutup jendela bagikan"
            />
          </View>

          <View style={styles.presetRow}>
            {PRESETS.map((item) => {
              const active = preset === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  onPress={() => setPreset(item.key)}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                >
                  {item.key === 'sticker' ? (
                    <Sparkles
                      size={13}
                      color={active ? PALETTE.onInverse : PALETTE.onSurfaceVariant}
                      strokeWidth={2}
                    />
                  ) : (
                    <Layers
                      size={13}
                      color={active ? PALETTE.onInverse : PALETTE.onSurfaceVariant}
                      strokeWidth={2}
                    />
                  )}
                  <Text
                    style={[
                      styles.presetText,
                      active && styles.presetTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.previewScroll}
          >
            {/* Preview studio backdrop khusus membantu melihat sticker transparan sebelum dishare */}
            <View
              style={[
                styles.previewStage,
                isSticker && styles.previewStageTransparentHint,
              ]}
            >
              <ViewShot
                ref={viewShotRef}
                options={{ format: 'png', quality: 1, result: 'tmpfile' }}
                style={styles.viewShotWrap}
              >
                <View
                  collapsable={false}
                  style={[
                    styles.card,
                    preset === 'paper' && styles.cardPaper,
                    preset === 'dark' && styles.cardDark,
                    preset === 'sticker' && styles.cardSticker,
                  ]}
                >
                  <View style={styles.cardTopRow}>
                    <View
                      style={[
                        styles.typeBadge,
                        isDark || isSticker ? styles.typeBadgeLight : styles.typeBadgeDark,
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeBadgeText,
                          isDark || isSticker ? styles.typeBadgeTextDark : styles.typeBadgeTextLight,
                        ]}
                      >
                        {workout.type.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.brandMark, { color: textSecondary }]}>
                      WALK THE TALK
                    </Text>
                  </View>

                  <Text
                    numberOfLines={2}
                    style={[styles.workoutTitle, { color: textPrimary }]}
                  >
                    {workout.title}
                  </Text>
                  <Text style={[styles.dateText, { color: textSecondary }]}>
                    {dateLabel}
                  </Text>

                  <View
                    collapsable={false}
                    style={[
                      styles.routeStage,
                      preset === 'paper' && styles.routeStagePaper,
                      preset === 'dark' && styles.routeStageDark,
                    ]}
                  >
                    <RouteSilhouette
                      routePoints={workout.routePoints}
                      width={ROUTE_WIDTH}
                      height={ROUTE_HEIGHT}
                      strokeColor={routeStroke}
                      strokeWidth={4}
                      startDotColor={routeStart}
                      endDotColor={routeEnd}
                      fallbackColor={textSecondary}
                    />
                  </View>

                  <View style={styles.heroDistanceRow}>
                    <Text style={[styles.heroDistanceVal, { color: accentHero }]}>
                      {(workout.distanceMeters / 1000).toFixed(2)}
                    </Text>
                    <Text style={[styles.heroDistanceUnit, { color: textSecondary }]}>
                      KM
                    </Text>
                  </View>

                  <View
                    style={[styles.hairline, { backgroundColor: hairlineColor }]}
                  />

                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricLabel, { color: textSecondary }]}>
                        WAKTU
                      </Text>
                      <Text style={[styles.metricVal, { color: textPrimary }]}>
                        {formatDuration(workout.durationSeconds)}
                      </Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricLabel, { color: textSecondary }]}>
                        AVG PACE
                      </Text>
                      <Text style={[styles.metricVal, { color: textPrimary }]}>
                        {formatPace(workout.avgPaceSecondsPerKm)}{' '}
                        <Text style={[styles.metricUnit, { color: textSecondary }]}>
                          /km
                        </Text>
                      </Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricLabel, { color: textSecondary }]}>
                        LANGKAH
                      </Text>
                      <Text style={[styles.metricVal, { color: textPrimary }]}>
                        {formatSteps(workout.steps ?? 0)}
                      </Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricLabel, { color: textSecondary }]}>
                        KALORI
                      </Text>
                      <Text style={[styles.metricVal, { color: textPrimary }]}>
                        {workout.caloriesKcal}{' '}
                        <Text style={[styles.metricUnit, { color: textSecondary }]}>
                          kcal
                        </Text>
                      </Text>
                    </View>
                  </View>

                  {workout.soundtrackTrackName ? (
                    <View
                      style={[
                        styles.musicFooter,
                        { borderTopColor: hairlineColor },
                      ]}
                    >
                      <Music
                        size={12}
                        color={accentHero}
                        strokeWidth={2}
                      />
                      <Text
                        numberOfLines={1}
                        style={[styles.musicFooterText, { color: textSecondary }]}
                      >
                        {workout.soundtrackTrackName} — {workout.soundtrackArtist}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </ViewShot>
            </View>

            {isSticker ? (
              <Text style={styles.stickerHint}>
                Diekspor sebagai PNG transparan — siap ditempel di IG Story atau TikTok.
              </Text>
            ) : null}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            disabled={isSharing}
            onPress={handleCaptureAndShare}
            style={({ pressed }) => [
              styles.shareCta,
              pressed && { opacity: 0.88 },
              isSharing && { opacity: 0.7 },
            ]}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={PALETTE.onPrimary} />
            ) : (
              <Share2 size={18} color={PALETTE.onPrimary} strokeWidth={2.2} />
            )}
            <Text style={styles.shareCtaText}>
              {isSharing ? 'Menyiapkan PNG...' : 'Bagikan Sekarang'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 19, 16, 0.56)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: PALETTE.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderCurve: 'continuous',
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.lg,
    paddingBottom: 32,
    maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  kicker: {
    ...TYPOGRAPHY.labelUppercase,
    color: PALETTE.onSurfaceVariant,
  },
  sheetTitle: {
    ...TYPOGRAPHY.headlineMd,
    color: PALETTE.onSurface,
    marginTop: 2,
  },
  presetRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    backgroundColor: PALETTE.surfaceAlt,
  },
  presetChipActive: {
    backgroundColor: PALETTE.surfaceInverse,
  },
  presetText: {
    ...TYPOGRAPHY.labelSm,
    color: PALETTE.onSurfaceVariant,
  },
  presetTextActive: {
    color: PALETTE.onInverse,
  },
  previewScroll: {
    alignItems: 'center',
    paddingBottom: SPACING.lg,
  },
  previewStage: {
    borderRadius: RADIUS.lg,
    padding: 4,
  },
  previewStageTransparentHint: {
    backgroundColor: '#1E211C',
    padding: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
  },
  viewShotWrap: {
    backgroundColor: 'transparent',
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.cardPadding,
  },
  cardPaper: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  cardDark: {
    backgroundColor: PALETTE.surfaceInverse,
  },
  cardSticker: {
    backgroundColor: 'transparent',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  typeBadgeDark: {
    backgroundColor: PALETTE.surfaceInverse,
  },
  typeBadgeLight: {
    backgroundColor: PALETTE.surface,
  },
  typeBadgeText: {
    ...TYPOGRAPHY.caption,
  },
  typeBadgeTextLight: {
    color: PALETTE.onInverse,
  },
  typeBadgeTextDark: {
    color: PALETTE.onSurface,
  },
  brandMark: {
    ...TYPOGRAPHY.caption,
  },
  workoutTitle: {
    ...TYPOGRAPHY.headlineSm,
    fontSize: 20,
    lineHeight: 24,
  },
  dateText: {
    ...TYPOGRAPHY.caption,
    marginTop: 3,
    marginBottom: SPACING.md,
  },
  routeStage: {
    width: ROUTE_WIDTH,
    height: ROUTE_HEIGHT,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  routeStagePaper: {
    backgroundColor: PALETTE.surfaceAlt,
  },
  routeStageDark: {
    backgroundColor: 'rgba(244, 242, 236, 0.05)',
  },
  heroDistanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  heroDistanceVal: {
    ...TYPOGRAPHY.displayXl,
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: -1.6,
  },
  heroDistanceUnit: {
    ...TYPOGRAPHY.headlineSm,
  },
  hairline: {
    height: 1,
    marginVertical: SPACING.md,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: SPACING.md,
  },
  metricCell: {
    width: '50%',
  },
  metricLabel: {
    ...TYPOGRAPHY.caption,
    marginBottom: 2,
  },
  metricVal: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 16,
    lineHeight: 20,
  },
  metricUnit: {
    ...TYPOGRAPHY.caption,
    textTransform: 'none',
    letterSpacing: 0,
  },
  musicFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    paddingTop: SPACING.sm,
    marginTop: SPACING.md,
  },
  musicFooterText: {
    ...TYPOGRAPHY.caption,
    textTransform: 'none',
    letterSpacing: 0,
    flex: 1,
  },
  stickerHint: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onSurfaceVariant,
    textAlign: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  shareCta: {
    height: 52,
    borderRadius: RADIUS.full,
    backgroundColor: PALETTE.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  shareCtaText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.displaySemiBold,
    color: PALETTE.onPrimary,
  },
});
