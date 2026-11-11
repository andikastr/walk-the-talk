import React from 'react';
import {
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import {
  Activity,
  ChevronRight,
  Flame,
  Footprints,
  Music,
  Trash2,
  User,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { getActivityLabel } from '@/constants/i18n';
import { usePreferences } from '@/context/AppPreferencesContext';
import { WorkoutRecord } from '@/types/workout';
import { formatDuration } from '@/services/location/metrics';

/**
 * Label uppercase all-caps berjarak +0.18em (1.8px) ciri khas DESIGN.md.
 */
export function KickerText({
  children,
  inverse = false,
  style,
  ...props
}: TextProps & { inverse?: boolean }) {
  const { palette } = usePreferences();

  return (
    <Text
      style={[
        TYPOGRAPHY.labelUppercase,
        { color: inverse ? palette.onFeatureMuted : palette.onSurfaceVariant },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}

/**
 * Tombol ikon bulat 40x40 berlatar surface-alt dengan opsional 6px ember alert dot.
 */
export function IconCircleButton({
  icon,
  onPress,
  showBadgeDot = false,
  accessibilityLabel,
  variant = 'surfaceAlt',
  style,
}: {
  icon: React.ReactNode;
  onPress?: () => void;
  showBadgeDot?: boolean;
  accessibilityLabel: string;
  variant?: 'surfaceAlt' | 'inverse' | 'raised';
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, isDark } = usePreferences();
  const bgColor =
    variant === 'inverse'
      ? palette.actionPrimary
      : variant === 'raised'
      ? palette.surfaceRaised
      : palette.surfaceAlt;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: bgColor },
        isDark && variant !== 'inverse' && { borderWidth: 1, borderColor: palette.border },
        pressed && { opacity: 0.72 },
        style,
      ]}
    >
      {icon}
      {showBadgeDot && <View style={[styles.badgeDot, { backgroundColor: palette.accent }]} />}
    </Pressable>
  );
}

/**
 * Header halaman editorial ("top-app-bar"): avatar + salam 2 baris di kiri, tombol ikon di kanan.
 * Duduk langsung di atas surface utama tanpa latar bar tambahan.
 */
export function TopAppBar({
  kicker,
  title,
  avatarUrl,
  rightActions,
  includeSafeAreaTop = true,
}: {
  kicker: string;
  title: string;
  avatarUrl?: string | null;
  rightActions?: React.ReactNode;
  includeSafeAreaTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { palette, isDark } = usePreferences();
  const topPad = includeSafeAreaTop ? Math.max(insets.top, 12) + 8 : 12;

  return (
    <View style={[styles.topBar, { paddingTop: topPad }]}>
      <View style={styles.topBarLeft}>
        <View
          style={[
            styles.avatarContainer,
            { backgroundColor: palette.surfaceAlt },
            isDark && { borderWidth: 1, borderColor: palette.border },
          ]}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
          ) : (
            <User size={18} strokeWidth={2} color={palette.onSurfaceVariant} />
          )}
        </View>
        <View style={styles.topBarTextCol}>
          <KickerText numberOfLines={1}>{kicker}</KickerText>
          <Text style={[styles.topBarTitle, { color: palette.onSurface }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </View>

      {rightActions && <View style={styles.topBarRight}>{rightActions}</View>}
    </View>
  );
}

export type ActivitySummaryItem = Omit<WorkoutRecord, 'routePoints' | 'splits'>;

/**
 * Kartu baris aktivitas ("list-row" / "card-raised") sesuai DESIGN.md:
 * thumbnail gelap 72x72 (radius 18), kicker + judul + metrik tabular dengan ember untuk kalori.
 */
export const ActivityRowCard = React.memo(function ActivityRowCard({
  workout,
  dateFormat = 'short',
  onPress,
  onDelete,
}: {
  workout: ActivitySummaryItem;
  dateFormat?: 'short' | 'full';
  onPress: (workout: ActivitySummaryItem) => void;
  onDelete?: (workout: ActivitySummaryItem) => void;
}) {
  const { palette, isDark, locale, t } = usePreferences();

  const dateObj = new Date(workout.startTime);
  const dateStr =
    dateFormat === 'full'
      ? dateObj.toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : dateObj.toLocaleDateString(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });

  const timeStr = dateObj.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const typeLabel = getActivityLabel(workout.type, t, true);
  const distKm = (workout.distanceMeters / 1000).toFixed(2);

  const renderActivityGlyph = () => {
    if (workout.type === 'walk') {
      return <Footprints size={24} strokeWidth={2} color={palette.onFeature} />;
    }
    if (workout.type === 'jog') {
      return <Activity size={24} strokeWidth={2} color={palette.onFeature} />;
    }
    return <Flame size={24} strokeWidth={2} color={palette.onFeature} />;
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${workout.title}, ${distKm} ${t.common.kmUnit}`}
      onPress={() => onPress(workout)}
      style={({ pressed }) => [
        styles.listRow,
        { backgroundColor: palette.surfaceRaised },
        isDark && { borderWidth: 1, borderColor: palette.border },
        pressed && { opacity: 0.78 },
      ]}
    >
      <View style={[styles.thumbFrame, { backgroundColor: palette.surfaceFeature }]}>
        {renderActivityGlyph()}
        <Text style={[styles.thumbCaption, { color: palette.onFeatureMuted }]}>
          {typeLabel}
        </Text>
      </View>

      <View style={styles.rowBody}>
        <KickerText numberOfLines={1}>
          {typeLabel} · {dateStr} {dateFormat === 'full' ? `· ${timeStr}` : ''}
        </KickerText>

        <Text style={[styles.rowTitle, { color: palette.onSurface }]} numberOfLines={1}>
          {workout.title}
        </Text>

        <View style={styles.metaStrip}>
          <Text style={[styles.metaText, { color: palette.onSurfaceVariant }]}>
            <Text style={[styles.metaNumInk, { color: palette.onSurface }]}>{distKm}</Text>{' '}
            {t.common.kmUnit}
          </Text>
          <View style={[styles.metaDivider, { backgroundColor: palette.border }]} />
          <Text style={[styles.metaText, { color: palette.onSurfaceVariant }]}>
            <Text style={[styles.metaNumEmber, { color: palette.accent }]}>
              {workout.caloriesKcal}
            </Text>{' '}
            {t.common.kcalUnit}
          </Text>
          <View style={[styles.metaDivider, { backgroundColor: palette.border }]} />
          <Text style={[styles.metaText, { color: palette.onSurfaceVariant }]}>
            {formatDuration(workout.durationSeconds)}
          </Text>
        </View>

        {workout.soundtrackTrackName ? (
          <View style={styles.soundtrackInline}>
            <Music size={12} strokeWidth={2} color={palette.onSurfaceVariant} />
            <Text
              style={[styles.soundtrackInlineText, { color: palette.onSurfaceVariant }]}
              numberOfLines={1}
            >
              {workout.soundtrackTrackName}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.rowActions}>
        {onDelete && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.history.deleteA11y(workout.title)}
            onPress={() => onDelete(workout)}
            hitSlop={10}
            style={({ pressed }) => [styles.deleteTouch, pressed && { opacity: 0.55 }]}
          >
            <Trash2 size={16} strokeWidth={2} color={palette.onSurfaceVariant} />
          </Pressable>
        )}
        <ChevronRight size={18} strokeWidth={2} color={palette.onSurfaceVariant} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: RADIUS.full,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.xxl,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
    minWidth: 0,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  topBarTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topBarTitle: {
    ...TYPOGRAPHY.headlineMd,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginLeft: SPACING.md,
  },
  listRow: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
  },
  thumbFrame: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  thumbCaption: {
    ...TYPOGRAPHY.caption,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...TYPOGRAPHY.cardTitle,
    marginTop: 4,
  },
  metaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  metaText: {
    ...TYPOGRAPHY.bodySm,
    fontVariant: ['tabular-nums'],
  },
  metaNumInk: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontVariant: ['tabular-nums'],
  },
  metaNumEmber: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontVariant: ['tabular-nums'],
  },
  metaDivider: {
    width: 1,
    height: 12,
  },
  soundtrackInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  soundtrackInlineText: {
    ...TYPOGRAPHY.labelSm,
    flex: 1,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteTouch: {
    padding: 4,
  },
});

