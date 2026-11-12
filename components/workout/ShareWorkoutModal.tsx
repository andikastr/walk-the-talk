import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import {
  Share2,
  Music,
  Layers,
  Sparkles,
  X,
  RectangleVertical,
  Smartphone,
  Activity,
} from 'lucide-react-native';
import { WorkoutRecord } from '@/types/workout';
import { formatDuration, formatPace, formatSteps } from '@/services/location/metrics';
import { normalizeWorkoutSoundtracks } from '@/services/spotify/workout-soundtrack';
import { ShareRouteMap } from '@/components/workout/ShareRouteMap';
import {
  computeShareCardLayout,
  ShareAspectRatio,
  SharePreset,
} from '@/components/workout/share-card-layout';
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

const TRACK_CELL_WIDTH_BY_COLS: Record<1 | 2 | 3 | 4, `${number}%`> = {
  1: '100%',
  2: '50%',
  3: '33.3333%',
  4: '25%',
};

export function ShareWorkoutModal({
  visible,
  workout,
  onClose,
}: ShareWorkoutModalProps) {
  const { palette, isDark: isAppDark, locale, t } = usePreferences();
  const insets = useSafeAreaInsets();
  const viewShotRef = useRef<ViewShotRef | null>(null);
  const [preset, setPreset] = useState<SharePreset>('paper');
  const [aspectRatio, setAspectRatio] = useState<ShareAspectRatio>('portrait');
  const [isSharing, setIsSharing] = useState(false);
  const tilesSettledRef = useRef(true);
  const tileWaitersRef = useRef<(() => void)[]>([]);
  const [feedback, setFeedback] = useState<InlineFeedbackState>({
    visible: false,
    tone: 'error',
    title: '',
    message: '',
  });

  const handleTilesSettledChange = useCallback((settled: boolean) => {
    tilesSettledRef.current = settled;
    if (settled && tileWaitersRef.current.length > 0) {
      const waiters = tileWaitersRef.current.splice(0);
      for (const resolve of waiters) {
        resolve();
      }
    }
  }, []);

  const soundtracks = useMemo(
    () => normalizeWorkoutSoundtracks(workout),
    [workout]
  );

  const showMapCanvas = !workout.isIndoor;

  const layout = useMemo(
    () => computeShareCardLayout(aspectRatio, soundtracks.length, showMapCanvas),
    [aspectRatio, soundtracks.length, showMapCanvas]
  );

  const visibleSoundtracks = useMemo(
    () => soundtracks.slice(0, layout.maxVisibleTracks),
    [soundtracks, layout.maxVisibleTracks]
  );

  const cadenceSpm = useMemo(() => {
    if (workout.durationSeconds <= 0) return 0;
    return Math.round((workout.steps ?? 0) / (workout.durationSeconds / 60));
  }, [workout.steps, workout.durationSeconds]);

  const presets: { key: SharePreset; label: string }[] = [
    { key: 'paper', label: t.shareModal.presets.paper },
    { key: 'dark', label: t.shareModal.presets.dark },
    { key: 'sticker', label: t.shareModal.presets.sticker },
  ];

  const ratioOptions: { key: ShareAspectRatio; label: string }[] = [
    { key: 'portrait', label: t.shareModal.ratioPortrait },
    { key: 'story', label: t.shareModal.ratioStory },
  ];

  // Export card uses fixed editorial presets so Paper PNG is always warm paper and Dark PNG is always ink.
  const isCardDark = preset === 'dark';
  const isSticker = preset === 'sticker';
  const mapTheme = isCardDark || isSticker ? 'dark' : 'light';

  const cardTextPrimary =
    isCardDark || isSticker ? LIGHT_PALETTE.onInverse : LIGHT_PALETTE.onSurface;
  const cardTextSecondary =
    isCardDark || isSticker
      ? LIGHT_PALETTE.onInverseMuted
      : LIGHT_PALETTE.onSurfaceVariant;
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

  const metrics = [
    {
      label: t.shareModal.time,
      value: formatDuration(workout.durationSeconds),
      unit: '',
    },
    {
      label: t.shareModal.avgPace,
      value: formatPace(workout.avgPaceSecondsPerKm),
      unit: '/km',
    },
    {
      label: t.shareModal.steps,
      value: formatSteps(workout.steps ?? 0),
      unit: '',
    },
    {
      label: t.shareModal.calories,
      value: `${workout.caloriesKcal}`,
      unit: t.common.kcalUnit,
    },
  ];

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

      if (showMapCanvas && !tilesSettledRef.current) {
        await Promise.race([
          new Promise<void>((resolve) => {
            tileWaitersRef.current.push(resolve);
          }),
          new Promise<void>((resolve) => {
            setTimeout(resolve, 3500);
          }),
        ]);
      }

      // Allow one frame commit before snapshotting ViewShot
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );

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
                    !active &&
                      isAppDark && { borderWidth: 1, borderColor: palette.border },
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
                        color: active
                          ? palette.onActionPrimary
                          : palette.onSurfaceVariant,
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.ratioSection}>
            <Text style={[styles.ratioSectionLabel, { color: palette.onSurfaceVariant }]}>
              {t.shareModal.formatLabel}
            </Text>
            <View style={styles.ratioRow}>
              {ratioOptions.map((item) => {
                const active = aspectRatio === item.key;
                const iconColor = active
                  ? palette.onPrimary
                  : palette.onSurfaceVariant;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    onPress={() => setAspectRatio(item.key)}
                    style={[
                      styles.ratioChip,
                      {
                        backgroundColor: active
                          ? palette.primary
                          : palette.modalSurfaceAlt,
                      },
                      !active &&
                        isAppDark && { borderWidth: 1, borderColor: palette.border },
                    ]}
                  >
                    {item.key === 'portrait' ? (
                      <RectangleVertical size={12} color={iconColor} strokeWidth={2.2} />
                    ) : (
                      <Smartphone size={12} color={iconColor} strokeWidth={2.2} />
                    )}
                    <Text style={[styles.ratioChipText, { color: iconColor }]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.previewScroll}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalCenter}
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
                      {
                        width: layout.width,
                        height: layout.height,
                        padding: layout.padding,
                      },
                      preset === 'paper' && styles.cardPaper,
                      preset === 'dark' && styles.cardDark,
                      preset === 'sticker' && styles.cardSticker,
                    ]}
                  >
                    <View style={styles.cardHeaderBlock}>
                      <View style={styles.cardTopRow}>
                        <View
                          style={[
                            styles.typeBadge,
                            isCardDark || isSticker
                              ? styles.typeBadgeLight
                              : styles.typeBadgeDark,
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
                      <Text
                        style={[
                          styles.dateText,
                          { color: cardTextSecondary },
                        ]}
                      >
                        {dateLabel}
                      </Text>
                    </View>

                    {layout.hasMap ? (
                      <View
                        collapsable={false}
                        style={[
                          styles.routeStage,
                          {
                            width: layout.stageWidth,
                            height: layout.stageHeight,
                          },
                          preset === 'paper' && styles.routeStagePaper,
                          preset === 'dark' && styles.routeStageDark,
                          preset === 'sticker' && styles.routeStageSticker,
                        ]}
                      >
                        <ShareRouteMap
                          routePoints={workout.routePoints}
                          width={layout.stageWidth}
                          height={layout.stageHeight}
                          theme={mapTheme}
                          strokeColor={routeStroke}
                          strokeWidth={4}
                          startDotColor={routeStart}
                          endDotColor={routeEnd}
                          fallbackColor={cardTextSecondary}
                          gpsStatusLabel={t.shareModal.gpsNotLocked}
                          onTilesSettledChange={handleTilesSettledChange}
                        />
                      </View>
                    ) : (
                      <View
                        collapsable={false}
                        style={[
                          styles.indoorPanel,
                          {
                            width: layout.stageWidth,
                            height: layout.stageHeight,
                          },
                          preset === 'paper' && styles.indoorPanelPaper,
                          preset === 'dark' && styles.indoorPanelDark,
                          preset === 'sticker' && styles.indoorPanelSticker,
                        ]}
                      >
                        <View style={styles.indoorPanelHeader}>
                          <Activity size={13} color={accentHero} strokeWidth={2.2} />
                          <Text
                            style={[
                              styles.indoorPanelTitle,
                              { color: cardTextSecondary },
                            ]}
                          >
                            {t.shareModal.indoorFocusTitle}
                          </Text>
                        </View>

                        <View style={styles.indoorFocusGrid}>
                          <View style={styles.indoorFocusCell}>
                            <Text
                              style={[
                                styles.indoorFocusLabel,
                                { color: cardTextSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {t.shareModal.cadenceLabel}
                            </Text>
                            <View style={styles.indoorFocusValueRow}>
                              <Text
                                style={[
                                  layout.ratio === 'story'
                                    ? styles.indoorFocusValueStory
                                    : styles.indoorFocusValue,
                                  { color: accentHero },
                                ]}
                              >
                                {cadenceSpm}
                              </Text>
                              <Text
                                style={[
                                  styles.indoorFocusUnit,
                                  { color: cardTextSecondary },
                                ]}
                              >
                                {t.shareModal.spmUnit}
                              </Text>
                            </View>
                          </View>

                          <View
                            style={[
                              styles.indoorDivider,
                              { backgroundColor: hairlineColor },
                            ]}
                          />

                          <View style={styles.indoorFocusCell}>
                            <Text
                              style={[
                                styles.indoorFocusLabel,
                                { color: cardTextSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {t.shareModal.activeDurationLabel}
                            </Text>
                            <Text
                              style={[
                                layout.ratio === 'story'
                                  ? styles.indoorFocusValueStory
                                  : styles.indoorFocusValue,
                                { color: cardTextPrimary },
                              ]}
                              numberOfLines={1}
                            >
                              {formatDuration(workout.durationSeconds)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}

                    <View style={styles.cardStatsBlock}>
                      <View style={styles.heroDistanceRow}>
                        <Text
                          style={[
                            layout.ratio === 'story'
                              ? styles.heroDistanceValStory
                              : styles.heroDistanceVal,
                            { color: accentHero },
                          ]}
                        >
                          {(workout.distanceMeters / 1000).toFixed(2)}
                        </Text>
                        <Text
                          style={[styles.heroDistanceUnit, { color: cardTextSecondary }]}
                        >
                          {t.common.kmUnit.toUpperCase()}
                        </Text>
                      </View>

                      <View
                        style={[styles.hairline, { backgroundColor: hairlineColor }]}
                      />

                      <View style={styles.metricsGrid}>
                        {metrics.map((metric) => (
                          <View key={metric.label} style={styles.metricCellHalf}>
                            <Text
                              style={[styles.metricLabel, { color: cardTextSecondary }]}
                              numberOfLines={1}
                            >
                              {metric.label}
                            </Text>
                            <Text
                              style={[styles.metricVal, { color: cardTextPrimary }]}
                              numberOfLines={1}
                            >
                              {metric.value}
                              {metric.unit ? (
                                <Text
                                  style={[
                                    styles.metricUnit,
                                    { color: cardTextSecondary },
                                  ]}
                                >
                                  {' '}
                                  {metric.unit}
                                </Text>
                              ) : null}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {visibleSoundtracks.length > 0 ? (
                      <View
                        style={[
                          styles.musicFooter,
                          { borderTopColor: hairlineColor },
                        ]}
                      >
                        <View style={styles.musicHeaderRow}>
                          <Music size={10} color={accentHero} strokeWidth={2.2} />
                          <Text
                            style={[
                              styles.musicHeaderLabel,
                              { color: cardTextSecondary },
                            ]}
                          >
                            {t.shareModal.soundtracksHeading(soundtracks.length)}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.musicTrackGrid,
                            layout.trackColumns > 1 && styles.musicTrackGridMultiCol,
                          ]}
                        >
                          {visibleSoundtracks.map((track, idx) => (
                            <View
                              key={`${track.trackId ?? track.trackName}-${idx}`}
                              style={[
                                styles.musicTrackCell,
                                { width: TRACK_CELL_WIDTH_BY_COLS[layout.trackColumns] },
                                layout.trackColumns > 1 && styles.musicTrackCellMulti,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.musicTrackIndex,
                                  layout.trackColumns >= 3 && styles.musicTrackIndexCompact,
                                  { color: accentHero },
                                ]}
                              >
                                {String(idx + 1).padStart(2, '0')}
                              </Text>
                              <Text
                                numberOfLines={1}
                                ellipsizeMode="tail"
                                style={[
                                  styles.musicFooterText,
                                  layout.trackColumns >= 3 && styles.musicFooterTextCompact,
                                  { color: cardTextPrimary },
                                ]}
                              >
                                {track.trackName}
                                {layout.showTrackArtist && track.artist ? (
                                  <Text style={{ color: cardTextSecondary }}>
                                    {' '}
                                    · {track.artist}
                                  </Text>
                                ) : null}
                              </Text>
                            </View>
                          ))}
                        </View>
                        {layout.overflowTracks > 0 ? (
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.musicOverflowText,
                              { color: cardTextSecondary },
                            ]}
                          >
                            {t.shareModal.soundtracksOverflow(layout.overflowTracks)}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </ViewShot>
              </View>
            </ScrollView>

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
    maxHeight: '94%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
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
    marginBottom: SPACING.sm,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: RADIUS.full,
  },
  presetText: {
    ...TYPOGRAPHY.labelSm,
  },
  ratioSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  ratioSectionLabel: {
    ...TYPOGRAPHY.caption,
  },
  ratioRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  ratioChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: RADIUS.full,
  },
  ratioChipText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
  },
  previewScroll: {
    alignItems: 'center',
    paddingBottom: SPACING.md,
  },
  horizontalCenter: {
    flexGrow: 1,
    justifyContent: 'center',
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
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    justifyContent: 'space-between',
    overflow: 'hidden',
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
  cardHeaderBlock: {},
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  typeBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
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
    fontSize: 10,
  },
  typeBadgeTextLight: {
    color: LIGHT_PALETTE.onInverse,
  },
  typeBadgeTextDark: {
    color: LIGHT_PALETTE.onSurface,
  },
  brandMark: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
  },
  workoutTitle: {
    ...TYPOGRAPHY.headlineSm,
    fontSize: 17,
    lineHeight: 20,
  },
  dateText: {
    ...TYPOGRAPHY.caption,
    marginTop: 2,
    marginBottom: 6,
  },
  routeStage: {
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeStagePaper: {
    backgroundColor: LIGHT_PALETTE.surfaceAlt,
  },
  routeStageDark: {
    backgroundColor: 'rgba(244, 242, 236, 0.05)',
  },
  routeStageSticker: {
    borderWidth: 1,
    borderColor: 'rgba(244, 242, 236, 0.28)',
  },
  indoorPanel: {
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  indoorPanelPaper: {
    backgroundColor: LIGHT_PALETTE.surfaceAlt,
    borderWidth: 1,
    borderColor: LIGHT_PALETTE.border,
  },
  indoorPanelDark: {
    backgroundColor: 'rgba(244, 242, 236, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(244, 242, 236, 0.14)',
  },
  indoorPanelSticker: {
    backgroundColor: 'rgba(14, 15, 12, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(244, 242, 236, 0.28)',
  },
  indoorPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  indoorPanelTitle: {
    ...TYPOGRAPHY.caption,
    fontSize: 9.5,
    letterSpacing: 0.9,
  },
  indoorFocusGrid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  indoorFocusCell: {
    flex: 1,
    justifyContent: 'center',
  },
  indoorDivider: {
    width: 1,
    height: '56%',
  },
  indoorFocusLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 9.5,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  indoorFocusValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  indoorFocusValue: {
    ...TYPOGRAPHY.displayXl,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.9,
  },
  indoorFocusValueStory: {
    ...TYPOGRAPHY.displayXl,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1.1,
  },
  indoorFocusUnit: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    textTransform: 'lowercase',
  },
  cardStatsBlock: {
    marginTop: 6,
  },
  heroDistanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  heroDistanceVal: {
    ...TYPOGRAPHY.displayXl,
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -1.3,
  },
  heroDistanceValStory: {
    ...TYPOGRAPHY.displayXl,
    fontSize: 42,
    lineHeight: 44,
    letterSpacing: -1.5,
  },
  heroDistanceUnit: {
    ...TYPOGRAPHY.headlineSm,
    fontSize: 13,
  },
  hairline: {
    height: 1,
    marginVertical: 6,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  metricCellHalf: {
    width: '50%',
  },
  metricLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 9,
    marginBottom: 1,
  },
  metricVal: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 14,
    lineHeight: 18,
  },
  metricUnit: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    textTransform: 'none',
    letterSpacing: 0,
  },
  musicFooter: {
    borderTopWidth: 1,
    paddingTop: 6,
    marginTop: 6,
    gap: 3,
  },
  musicHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  musicHeaderLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 9,
    letterSpacing: 0.7,
    lineHeight: 13,
  },
  musicTrackGrid: {
    rowGap: 2,
  },
  musicTrackGridMultiCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 2,
  },
  musicTrackCell: {
    height: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  musicTrackCellMulti: {
    paddingRight: 4,
  },
  musicTrackIndex: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 9.5,
    lineHeight: 13,
  },
  musicTrackIndexCompact: {
    fontSize: 8.5,
    lineHeight: 13,
  },
  musicFooterText: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    lineHeight: 13,
    textTransform: 'none',
    letterSpacing: 0,
    flex: 1,
  },
  musicFooterTextCompact: {
    fontSize: 9,
    lineHeight: 13,
  },
  musicOverflowText: {
    ...TYPOGRAPHY.caption,
    fontSize: 9,
    lineHeight: 13,
    textTransform: 'none',
    letterSpacing: 0,
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
