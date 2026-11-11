import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Share2, Music, Layers, Sparkles, X } from 'lucide-react-native';
import { WorkoutRecord } from '@/types/workout';
import { formatDuration, formatPace, formatSteps } from '@/services/location/metrics';
import { RouteSilhouette } from '@/components/workout/RouteSilhouette';
import { IconCircleButton } from '@/components/ui/EditorialPrimitives';
import { AppDialogOverlay, AppDialogTone } from '@/components/ui/AppDialogOverlay';
import {
  LIGHT_PALETTE,
  RADIUS,
  SPACING,
  TYPOGRAPHY,
  FONT_FAMILY,
} from '@/constants/Colors';
import { getActivityLabel } from '@/constants/i18n';
import { usePreferences } from '@/context/AppPreferencesContext';

type SharePreset = 'paper' | 'dark' | 'sticker';

interface ShareWorkoutModalProps {
  visible: boolean;
  workout: WorkoutRecord;
  onClose: () => void;
}

interface InlineFeedbackState {
  visible: boolean;
  tone: AppDialogTone;
  title: string;
  message: string;
}

const CARD_WIDTH = 316;
const ROUTE_WIDTH = 276;
const ROUTE_HEIGHT = 148;

export function ShareWorkoutModal({
  visible,
  workout,
  onClose,
}: ShareWorkoutModalProps) {
  const { palette, isDark: isAppDark, locale, t } = usePreferences();
  const insets = useSafeAreaInsets();
  const viewShotRef = useRef<ViewShotRef | null>(null);
  const [preset, setPreset] = useState<SharePreset>('paper');
  const [isSharing, setIsSharing] = useState(false);
  const [feedback, setFeedback] = useState<InlineFeedbackState>({
    visible: false,
    tone: 'error',
    title: '',
    message: '',
  });

  const presets: { key: SharePreset; label: string }[] = [
    { key: 'paper', label: t.shareModal.presets.paper },
    { key: 'dark', label: t.shareModal.presets.dark },
    { key: 'sticker', label: t.shareModal.presets.sticker },
  ];

  // Export card uses fixed editorial presets so Paper PNG is always warm paper and Dark PNG is always ink.
  const isCardDark = preset === 'dark';
  const isSticker = preset === 'sticker';

  const cardTextPrimary =
    isCardDark || isSticker ? LIGHT_PALETTE.onInverse : LIGHT_PALETTE.onSurface;
  const cardTextSecondary =
    isCardDark || isSticker ? LIGHT_PALETTE.onInverseMuted : LIGHT_PALETTE.onSurfaceVariant;
  const accentHero =
    isCardDark || isSticker ? LIGHT_PALETTE.primary : LIGHT_PALETTE.accent;
  const hairlineColor = isCardDark
    ? 'rgba(244, 242, 236, 0.14)'
    : isSticker
      ? 'rgba(244, 242, 236, 0.25)'
      : LIGHT_PALETTE.border;
  const routeStroke = isCardDark ? LIGHT_PALETTE.primary : LIGHT_PALETTE.accent;
  const routeStart = LIGHT_PALETTE.surfaceInverse;
  const routeEnd = isCardDark ? LIGHT_PALETTE.accent : LIGHT_PALETTE.primary;

  const typeLabel = getActivityLabel(workout.type, t, true);

  const dateLabel = new Date(workout.startTime)
    .toLocaleDateString(locale, {
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
        setFeedback({
          visible: true,
          tone: 'error',
          title: t.shareModal.unsupportedTitle,
          message: t.shareModal.unsupportedMessage,
        });
        return;
      }

      const uri = await viewShotRef.current?.capture?.();
      if (!uri) {
        setFeedback({
          visible: true,
          tone: 'error',
          title: t.shareModal.captureFailTitle,
          message: t.shareModal.captureFailMessage,
        });
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: t.shareModal.shareDialogTitle,
      });
    } catch {
      setFeedback({
        visible: true,
        tone: 'error',
        title: t.shareModal.shareFailTitle,
        message: t.shareModal.shareFailMessage,
      });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: palette.backdrop }]}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.modalSurface,
              paddingBottom: Math.max(insets.bottom, 20) + 12,
            },
            isAppDark && { borderTopWidth: 1, borderColor: palette.border },
          ]}
        >
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]}>
                {t.shareModal.kicker}
              </Text>
              <Text style={[styles.sheetTitle, { color: palette.onSurface }]}>
                {t.shareModal.title}
              </Text>
            </View>
            <IconCircleButton
              icon={<X size={18} strokeWidth={2} color={palette.onSurface} />}
              onPress={onClose}
              accessibilityLabel={t.shareModal.closeA11y}
            />
          </View>

          <View style={styles.presetRow}>
            {presets.map((item) => {
              const active = preset === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  onPress={() => setPreset(item.key)}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: active
                        ? palette.actionPrimary
                        : palette.modalSurfaceAlt,
                    },
                    !active && isAppDark && { borderWidth: 1, borderColor: palette.border },
                  ]}
                >
                  {item.key === 'sticker' ? (
                    <Sparkles
                      size={13}
                      color={active ? palette.onActionPrimary : palette.onSurfaceVariant}
                      strokeWidth={2}
                    />
                  ) : (
                    <Layers
                      size={13}
                      color={active ? palette.onActionPrimary : palette.onSurfaceVariant}
                      strokeWidth={2}
                    />
                  )}
                  <Text
                    style={[
                      styles.presetText,
                      {
                        color: active ? palette.onActionPrimary : palette.onSurfaceVariant,
                      },
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
                        isCardDark || isSticker ? styles.typeBadgeLight : styles.typeBadgeDark,
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeBadgeText,
                          isCardDark || isSticker
                            ? styles.typeBadgeTextDark
                            : styles.typeBadgeTextLight,
                        ]}
                      >
                        {typeLabel}
                      </Text>
                    </View>
                    <Text style={[styles.brandMark, { color: cardTextSecondary }]}>
                      WALK THE TALK
                    </Text>
                  </View>

                  <Text
                    numberOfLines={2}
                    style={[styles.workoutTitle, { color: cardTextPrimary }]}
                  >
                    {workout.title}
                  </Text>
                  <Text style={[styles.dateText, { color: cardTextSecondary }]}>
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
                      fallbackColor={cardTextSecondary}
                    />
                  </View>

                  <View style={styles.heroDistanceRow}>
                    <Text style={[styles.heroDistanceVal, { color: accentHero }]}>
                      {(workout.distanceMeters / 1000).toFixed(2)}
                    </Text>
                    <Text style={[styles.heroDistanceUnit, { color: cardTextSecondary }]}>
                      {t.common.kmUnit.toUpperCase()}
                    </Text>
                  </View>

                  <View
                    style={[styles.hairline, { backgroundColor: hairlineColor }]}
                  />

                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricLabel, { color: cardTextSecondary }]}>
                        {t.shareModal.time}
                      </Text>
                      <Text style={[styles.metricVal, { color: cardTextPrimary }]}>
                        {formatDuration(workout.durationSeconds)}
                      </Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricLabel, { color: cardTextSecondary }]}>
                        {t.shareModal.avgPace}
                      </Text>
                      <Text style={[styles.metricVal, { color: cardTextPrimary }]}>
                        {formatPace(workout.avgPaceSecondsPerKm)}{' '}
                        <Text style={[styles.metricUnit, { color: cardTextSecondary }]}>
                          /km
                        </Text>
                      </Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricLabel, { color: cardTextSecondary }]}>
                        {t.shareModal.steps}
                      </Text>
                      <Text style={[styles.metricVal, { color: cardTextPrimary }]}>
                        {formatSteps(workout.steps ?? 0)}
                      </Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricLabel, { color: cardTextSecondary }]}>
                        {t.shareModal.calories}
                      </Text>
                      <Text style={[styles.metricVal, { color: cardTextPrimary }]}>
                        {workout.caloriesKcal}{' '}
                        <Text style={[styles.metricUnit, { color: cardTextSecondary }]}>
                          {t.common.kcalUnit}
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
                        style={[styles.musicFooterText, { color: cardTextSecondary }]}
                      >
                        {workout.soundtrackTrackName} — {workout.soundtrackArtist}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </ViewShot>
            </View>

            {isSticker ? (
              <Text style={[styles.stickerHint, { color: palette.onSurfaceVariant }]}>
                {t.shareModal.stickerHint}
              </Text>
            ) : null}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            disabled={isSharing}
            onPress={handleCaptureAndShare}
            style={({ pressed }) => [
              styles.shareCta,
              { backgroundColor: palette.primary },
              pressed && { backgroundColor: palette.primaryDeep },
              isSharing && { opacity: 0.7 },
            ]}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={palette.onPrimary} />
            ) : (
              <Share2 size={18} color={palette.onPrimary} strokeWidth={2.2} />
            )}
            <Text style={[styles.shareCtaText, { color: palette.onPrimary }]}>
              {isSharing ? t.shareModal.preparingPng : t.shareModal.shareNow}
            </Text>
          </Pressable>
        </View>

        <AppDialogOverlay
          inline
          visible={feedback.visible}
          tone={feedback.tone}
          title={feedback.title}
          message={feedback.message}
          onDismiss={() => setFeedback((prev) => ({ ...prev, visible: false }))}
          actions={[
            {
              id: 'ok',
              label: t.common.ok,
              variant: 'primary',
              onPress: () => setFeedback((prev) => ({ ...prev, visible: false })),
            },
          ]}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderCurve: 'continuous',
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.lg,
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
  },
  sheetTitle: {
    ...TYPOGRAPHY.headlineMd,
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
  },
  presetText: {
    ...TYPOGRAPHY.labelSm,
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
    backgroundColor: LIGHT_PALETTE.surface,
    borderWidth: 1,
    borderColor: LIGHT_PALETTE.border,
  },
  cardDark: {
    backgroundColor: LIGHT_PALETTE.surfaceInverse,
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
    backgroundColor: LIGHT_PALETTE.surfaceInverse,
  },
  typeBadgeLight: {
    backgroundColor: LIGHT_PALETTE.surface,
  },
  typeBadgeText: {
    ...TYPOGRAPHY.caption,
  },
  typeBadgeTextLight: {
    color: LIGHT_PALETTE.onInverse,
  },
  typeBadgeTextDark: {
    color: LIGHT_PALETTE.onSurface,
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
    backgroundColor: LIGHT_PALETTE.surfaceAlt,
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
    textAlign: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  shareCta: {
    height: 52,
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  shareCtaText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.displaySemiBold,
  },
});
