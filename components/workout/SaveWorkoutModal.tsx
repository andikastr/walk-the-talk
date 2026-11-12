import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Music } from 'lucide-react-native';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';
import { formatDuration, formatPace, formatSteps } from '@/services/location/metrics';
import { normalizeWorkoutSoundtracks } from '@/services/spotify/workout-soundtrack';
import { AppDialogOverlay } from '@/components/ui/AppDialogOverlay';
import type { WorkoutSoundtrackItem } from '@/types/workout';

interface SaveWorkoutModalProps {
  visible: boolean;
  workoutTitle: string;
  onChangeTitle: (value: string) => void;
  distanceMeters: number;
  durationSeconds: number;
  avgPaceSeconds: number;
  steps: number;
  soundtracks?: WorkoutSoundtrackItem[];
  soundtrackTrackName?: string;
  soundtrackArtistName?: string;
  isSyncingSoundtracks?: boolean;
  onSave: () => Promise<void> | void;
  onDiscard: () => void;
}

export function SaveWorkoutModal({
  visible,
  workoutTitle,
  onChangeTitle,
  distanceMeters,
  durationSeconds,
  avgPaceSeconds,
  steps,
  soundtracks,
  soundtrackTrackName,
  soundtrackArtistName,
  isSyncingSoundtracks = false,
  onSave,
  onDiscard,
}: SaveWorkoutModalProps) {
  const { palette, isDark, t } = usePreferences();
  const insets = useSafeAreaInsets();
  const [discardDialogVisible, setDiscardDialogVisible] = useState(false);

  const resolvedSoundtracks = normalizeWorkoutSoundtracks({
    soundtracks,
    soundtrackTrackName,
    soundtrackArtist: soundtrackArtistName,
  });

  const handleRequestDiscard = () => {
    setDiscardDialogVisible(true);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onShow={() => setDiscardDialogVisible(false)}
      onRequestClose={handleRequestDiscard}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardRoot}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: palette.backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleRequestDiscard} />

          <View
            style={[
              styles.sheet,
              {
                backgroundColor: palette.modalSurface,
                paddingBottom: Math.max(insets.bottom, 24) + 12,
              },
              isDark && { borderTopWidth: 1, borderColor: palette.border },
            ]}
          >
            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.modalKicker, { color: palette.onSurfaceVariant }]}>
                {t.saveModal.kicker}
              </Text>
              <Text style={[styles.heading, { color: palette.onSurface }]}>
                {t.saveModal.title}
              </Text>
              <Text style={[styles.subtitle, { color: palette.onSurfaceVariant }]}>
                {t.saveModal.subtitle}
              </Text>

              <TextInput
                style={[
                  styles.titleInput,
                  {
                    backgroundColor: palette.modalSurfaceAlt,
                    color: palette.onSurface,
                  },
                  isDark && { borderWidth: 1, borderColor: palette.border },
                ]}
                value={workoutTitle}
                onChangeText={onChangeTitle}
                placeholder={t.saveModal.placeholder}
                placeholderTextColor={palette.onSurfaceVariant}
                returnKeyType="done"
              />

              <View
                style={[
                  styles.summaryStatsBox,
                  { backgroundColor: palette.modalSurfaceAlt },
                  isDark && { borderWidth: 1, borderColor: palette.border },
                ]}
              >
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryStatLabel, { color: palette.onSurfaceVariant }]}>
                    {t.saveModal.distance}
                  </Text>
                  <Text style={[styles.summaryStatEmber, { color: palette.accent }]}>
                    {(distanceMeters / 1000).toFixed(2)} {t.common.kmUnit}
                  </Text>
                </View>

                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryStatLabel, { color: palette.onSurfaceVariant }]}>
                    {t.saveModal.duration}
                  </Text>
                  <Text style={[styles.summaryStatVal, { color: palette.onSurface }]}>
                    {formatDuration(durationSeconds)}
                  </Text>
                </View>

                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryStatLabel, { color: palette.onSurfaceVariant }]}>
                    {t.saveModal.avgPace}
                  </Text>
                  <Text style={[styles.summaryStatVal, { color: palette.onSurface }]}>
                    {formatPace(avgPaceSeconds)}
                  </Text>
                </View>

                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryStatLabel, { color: palette.onSurfaceVariant }]}>
                    {t.saveModal.steps}
                  </Text>
                  <Text style={[styles.summaryStatVal, { color: palette.onSurface }]}>
                    {formatSteps(steps)}
                  </Text>
                </View>
              </View>

              {(resolvedSoundtracks.length > 0 || isSyncingSoundtracks) ? (
                <View
                  style={[
                    styles.soundtrackPreview,
                    { backgroundColor: palette.surfaceFeature },
                    isDark && { borderWidth: 1, borderColor: palette.border },
                  ]}
                >
                  <View style={styles.soundtrackHeaderRow}>
                    <View style={styles.soundtrackHeaderLeft}>
                      <Music size={15} strokeWidth={2} color={palette.spotifyGreen} />
                      <Text style={[styles.soundtrackHeaderTitle, { color: palette.onFeature }]}>
                        {resolvedSoundtracks.length > 0
                          ? t.saveModal.soundtrackCountLabel(resolvedSoundtracks.length)
                          : t.saveModal.soundtrackPrefix}
                      </Text>
                    </View>
                    {isSyncingSoundtracks ? (
                      <ActivityIndicator size="small" color={palette.spotifyGreen} />
                    ) : null}
                  </View>

                  {isSyncingSoundtracks && resolvedSoundtracks.length === 0 ? (
                    <Text style={[styles.soundtrackSyncText, { color: palette.onFeatureMuted }]}>
                      {t.saveModal.syncingSoundtrack}
                    </Text>
                  ) : null}

                  {resolvedSoundtracks.length > 0 ? (
                    <ScrollView
                      style={styles.soundtrackListScroll}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={resolvedSoundtracks.length > 3}
                    >
                      {resolvedSoundtracks.map((track, idx) => (
                        <View
                          key={`${track.trackId ?? track.trackName}-${idx}`}
                          style={[
                            styles.soundtrackTrackRow,
                            idx > 0 && styles.soundtrackTrackRowSpacing,
                          ]}
                        >
                          <Text
                            style={[styles.soundtrackTrackIndex, { color: palette.onFeatureMuted }]}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </Text>
                          <View style={styles.soundtrackTrackInfo}>
                            <Text
                              style={[styles.soundtrackPreviewText, { color: palette.onFeature }]}
                              numberOfLines={1}
                            >
                              {track.trackName}
                            </Text>
                            <Text
                              style={[styles.soundtrackTrackArtist, { color: palette.onFeatureMuted }]}
                              numberOfLines={1}
                            >
                              {track.artist}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.discardBtn,
                    { backgroundColor: palette.modalSurfaceAlt },
                    pressed && { opacity: 0.78 },
                  ]}
                  onPress={handleRequestDiscard}
                >
                  <Text style={[styles.discardBtnText, { color: palette.onSurface }]}>
                    {t.saveModal.discardBtn}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.saveBtn,
                    { backgroundColor: palette.actionPrimary },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={onSave}
                >
                  <Text style={[styles.saveBtnText, { color: palette.onActionPrimary }]}>
                    {t.saveModal.saveBtn}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>

          <AppDialogOverlay
            inline
            visible={discardDialogVisible}
            tone="destructive"
            dismissible
            title={t.saveModal.discardTitle}
            message={t.saveModal.discardMessage}
            onDismiss={() => setDiscardDialogVisible(false)}
            actions={[
              {
                id: 'cancel',
                label: t.common.cancel,
                variant: 'secondary',
                onPress: () => setDiscardDialogVisible(false),
              },
              {
                id: 'discard',
                label: t.saveModal.discardConfirm,
                variant: 'destructive',
                onPress: () => {
                  setDiscardDialogVisible(false);
                  onDiscard();
                },
              },
            ]}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.xxl,
    maxHeight: '90%',
  },
  modalKicker: {
    ...TYPOGRAPHY.labelUppercase,
    marginBottom: 4,
  },
  heading: {
    ...TYPOGRAPHY.displayMd,
    fontSize: 24,
  },
  subtitle: {
    ...TYPOGRAPHY.bodyMd,
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  titleInput: {
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    padding: SPACING.lg,
    ...TYPOGRAPHY.headlineSm,
    marginBottom: SPACING.lg,
  },
  summaryStatsBox: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  summaryStat: {
    width: '50%',
  },
  summaryStatLabel: {
    ...TYPOGRAPHY.caption,
    marginBottom: 4,
  },
  summaryStatEmber: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 18,
  },
  summaryStatVal: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 18,
  },
  soundtrackPreview: {
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  soundtrackHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  soundtrackHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  soundtrackHeaderTitle: {
    ...TYPOGRAPHY.caption,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
  soundtrackSyncText: {
    ...TYPOGRAPHY.caption,
  },
  soundtrackListScroll: {
    maxHeight: 136,
  },
  soundtrackTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  soundtrackTrackRowSpacing: {
    marginTop: 6,
  },
  soundtrackTrackIndex: {
    ...TYPOGRAPHY.numeralSm,
    fontSize: 11,
    width: 18,
  },
  soundtrackTrackInfo: {
    flex: 1,
    minWidth: 0,
  },
  soundtrackPreviewText: {
    ...TYPOGRAPHY.bodySm,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
  soundtrackTrackArtist: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  discardBtn: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardBtnText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.displaySemiBold,
  },
});

