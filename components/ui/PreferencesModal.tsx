import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  Globe,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Smartphone,
  Sun,
  X,
} from 'lucide-react-native';
import {
  FONT_FAMILY,
  RADIUS,
  SPACING,
  ThemeMode,
  TYPOGRAPHY,
} from '@/constants/Colors';
import { WORKOUT_CONFIG } from '@/constants/Config';
import { AppLanguage } from '@/constants/i18n';
import { usePreferences } from '@/context/AppPreferencesContext';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { AppDialogOverlay, AppDialogTone } from '@/components/ui/AppDialogOverlay';

interface PreferencesModalProps {
  visible: boolean;
  onClose: () => void;
}

interface InlineFeedbackState {
  visible: boolean;
  tone: AppDialogTone;
  title: string;
  message: string;
  canReload?: boolean;
}

export function PreferencesModal({ visible, onClose }: PreferencesModalProps) {
  const insets = useSafeAreaInsets();
  const {
    themeMode,
    language,
    weightKg,
    palette,
    isDark,
    t,
    setThemeMode,
    setLanguage,
    setWeightKg,
  } = usePreferences();
  const {
    isUpdatePending,
    checkForUpdateManually,
    applyPendingUpdate,
  } = useAppUpdates();

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [editingWeight, setEditingWeight] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<InlineFeedbackState>({
    visible: false,
    tone: 'info',
    title: '',
    message: '',
  });

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const themeOptions: {
    key: ThemeMode;
    label: string;
    renderIcon: (active: boolean) => React.ReactNode;
  }[] = [
    {
      key: 'system',
      label: t.preferences.themeSystem,
      renderIcon: (active) => (
        <Smartphone
          size={16}
          strokeWidth={2}
          color={active ? palette.onActionPrimary : palette.onSurfaceVariant}
        />
      ),
    },
    {
      key: 'light',
      label: t.preferences.themeLight,
      renderIcon: (active) => (
        <Sun
          size={16}
          strokeWidth={2}
          color={active ? palette.onActionPrimary : palette.onSurfaceVariant}
        />
      ),
    },
    {
      key: 'dark',
      label: t.preferences.themeDark,
      renderIcon: (active) => (
        <Moon
          size={16}
          strokeWidth={2}
          color={active ? palette.onActionPrimary : palette.onSurfaceVariant}
        />
      ),
    },
  ];

  const languageOptions: { key: AppLanguage; label: string; shortCode: string }[] = [
    { key: 'id', label: t.preferences.languageId, shortCode: 'ID' },
    { key: 'en', label: t.preferences.languageEn, shortCode: 'EN' },
  ];

  const handleCheckUpdate = async () => {
    if (isUpdatePending) {
      await applyPendingUpdate();
      return;
    }

    setIsCheckingUpdate(true);
    try {
      const res = await checkForUpdateManually({ suppressDialog: true });
      setFeedback({
        visible: true,
        tone:
          res.status === 'error'
            ? 'error'
            : res.status === 'found' || res.status === 'latest'
            ? 'success'
            : 'info',
        title: res.title,
        message: res.message,
        canReload: res.status === 'found',
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: palette.backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.modalSurface,
              paddingBottom: Math.max(insets.bottom, SPACING.xxl) + SPACING.sm,
            },
            isDark && { borderTopWidth: 1, borderColor: palette.border },
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]}>
                {t.preferences.kicker}
              </Text>
              <Text style={[styles.title, { color: palette.onSurface }]}>
                {t.preferences.title}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.preferences.closeA11y}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: palette.modalSurfaceAlt },
                pressed && { opacity: 0.72 },
              ]}
            >
              <X size={18} strokeWidth={2} color={palette.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Section 1: Theme Preference */}
            <View style={styles.section}>
              <Text style={[styles.sectionKicker, { color: palette.onSurfaceVariant }]}>
                {t.preferences.themeLabel}
              </Text>
              <View style={styles.themeRow}>
                {themeOptions.map((item) => {
                  const active = themeMode === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setThemeMode(item.key)}
                      style={({ pressed }) => [
                        styles.themeTile,
                        {
                          backgroundColor: active
                            ? palette.actionPrimary
                            : palette.modalSurfaceAlt,
                        },
                        pressed && { opacity: 0.82 },
                      ]}
                    >
                      <View style={styles.themeTileTop}>
                        {item.renderIcon(active)}
                        {active && (
                          <View
                            style={[styles.limeDot, { backgroundColor: palette.primary }]}
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.themeTileLabel,
                          {
                            color: active
                              ? palette.onActionPrimary
                              : palette.onSurface,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.helperText, { color: palette.onSurfaceVariant }]}>
                {t.preferences.themeHint}
              </Text>
            </View>

            <View style={[styles.hairline, { backgroundColor: palette.border }]} />

            {/* Section 2: Language Preference */}
            <View style={styles.section}>
              <Text style={[styles.sectionKicker, { color: palette.onSurfaceVariant }]}>
                {t.preferences.languageLabel}
              </Text>
              <View style={styles.langRow}>
                {languageOptions.map((item) => {
                  const active = language === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setLanguage(item.key)}
                      style={({ pressed }) => [
                        styles.langTile,
                        {
                          backgroundColor: active
                            ? palette.actionPrimary
                            : palette.modalSurfaceAlt,
                        },
                        pressed && { opacity: 0.82 },
                      ]}
                    >
                      <View style={styles.langLeft}>
                        <Globe
                          size={15}
                          strokeWidth={2}
                          color={
                            active ? palette.primary : palette.onSurfaceVariant
                          }
                        />
                        <Text
                          style={[
                            styles.langLabel,
                            {
                              color: active
                                ? palette.onActionPrimary
                                : palette.onSurface,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                      </View>
                      {active && (
                        <Check
                          size={16}
                          strokeWidth={2.2}
                          color={palette.primary}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.hairline, { backgroundColor: palette.border }]} />

            {/* Section 3: Body Weight (kg) for accurate MET calorie calculation */}
            <View style={styles.section}>
              <Text style={[styles.sectionKicker, { color: palette.onSurfaceVariant }]}>
                {t.preferences.bodyWeightLabel}
              </Text>
              <View style={styles.weightRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setEditingWeight(null);
                    void setWeightKg(weightKg - 1);
                  }}
                  style={({ pressed }) => [
                    styles.weightStepBtn,
                    { backgroundColor: palette.modalSurfaceAlt },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Minus size={18} strokeWidth={2.2} color={palette.onSurface} />
                </Pressable>

                <View
                  style={[
                    styles.weightValueBox,
                    { backgroundColor: palette.modalSurfaceAlt },
                  ]}
                >
                  <TextInput
                    style={[styles.weightInput, { color: palette.onSurface }]}
                    keyboardType="number-pad"
                    maxLength={3}
                    value={editingWeight ?? String(weightKg)}
                    onFocus={() => setEditingWeight(String(weightKg))}
                    onChangeText={(text) => setEditingWeight(text.replace(/[^0-9]/g, ''))}
                    onEndEditing={() => {
                      const parsed = Number(editingWeight);
                      setEditingWeight(null);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        void setWeightKg(
                          Math.min(
                            WORKOUT_CONFIG.maxWeightKg,
                            Math.max(WORKOUT_CONFIG.minWeightKg, parsed)
                          )
                        );
                      }
                    }}
                    returnKeyType="done"
                  />
                  <Text style={[styles.weightUnit, { color: palette.onSurfaceVariant }]}>
                    {t.preferences.kgUnit}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setEditingWeight(null);
                    void setWeightKg(weightKg + 1);
                  }}
                  style={({ pressed }) => [
                    styles.weightStepBtn,
                    { backgroundColor: palette.modalSurfaceAlt },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Plus size={18} strokeWidth={2.2} color={palette.onSurface} />
                </Pressable>
              </View>
              <Text style={[styles.helperText, { color: palette.onSurfaceVariant }]}>
                {t.preferences.bodyWeightHint}
              </Text>
            </View>

            <View style={[styles.hairline, { backgroundColor: palette.border }]} />

            {/* Section 4: App Version & Friendly Update Check */}
            <View
              style={[
                styles.updateCard,
                { backgroundColor: palette.modalSurfaceAlt },
              ]}
            >
              <View style={styles.updateHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.sectionKicker, { color: palette.onSurfaceVariant }]}
                  >
                    {t.preferences.appUpdateLabel}
                  </Text>
                  <Text style={[styles.versionText, { color: palette.onSurface }]}>
                    {t.preferences.versionPrefix} {appVersion}
                  </Text>
                </View>
                {isUpdatePending && (
                  <View
                    style={[styles.updateDot, { backgroundColor: palette.accent }]}
                  />
                )}
              </View>

              {isUpdatePending && (
                <Text
                  style={[styles.updateHint, { color: palette.onSurfaceVariant }]}
                >
                  {t.preferences.updateReadyHint}
                </Text>
              )}

              <Pressable
                accessibilityRole="button"
                disabled={isCheckingUpdate}
                onPress={handleCheckUpdate}
                style={({ pressed }) => [
                  styles.updateBtn,
                  {
                    backgroundColor: isUpdatePending
                      ? palette.primary
                      : palette.actionPrimary,
                  },
                  pressed && { opacity: 0.84 },
                  isCheckingUpdate && { opacity: 0.7 },
                ]}
              >
                {isCheckingUpdate ? (
                  <ActivityIndicator
                    size="small"
                    color={palette.onActionPrimary}
                  />
                ) : (
                  <RefreshCw
                    size={15}
                    strokeWidth={2}
                    color={
                      isUpdatePending ? palette.onPrimary : palette.onActionPrimary
                    }
                  />
                )}
                <Text
                  style={[
                    styles.updateBtnText,
                    {
                      color: isUpdatePending
                        ? palette.onPrimary
                        : palette.onActionPrimary,
                    },
                  ]}
                >
                  {isCheckingUpdate
                    ? t.preferences.checkingUpdateBtn
                    : isUpdatePending
                    ? t.preferences.applyUpdateBtn
                    : t.preferences.checkUpdateBtn}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>

        <AppDialogOverlay
          inline
          visible={feedback.visible}
          kicker={t.updates.kicker}
          title={feedback.title}
          message={feedback.message}
          tone={feedback.tone}
          onDismiss={() => setFeedback((prev) => ({ ...prev, visible: false }))}
          actions={
            feedback.canReload
              ? [
                  {
                    id: 'later',
                    label: t.common.later,
                    variant: 'secondary',
                    onPress: () =>
                      setFeedback((prev) => ({ ...prev, visible: false })),
                  },
                  {
                    id: 'reload',
                    label: t.updates.reloadAction,
                    variant: 'primary',
                    onPress: () => {
                      setFeedback((prev) => ({ ...prev, visible: false }));
                      applyPendingUpdate();
                    },
                  },
                ]
              : [
                  {
                    id: 'ok',
                    label: t.common.ok,
                    variant: 'primary',
                    onPress: () =>
                      setFeedback((prev) => ({ ...prev, visible: false })),
                  },
                ]
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderCurve: 'continuous',
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.xl,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xl,
  },
  kicker: {
    ...TYPOGRAPHY.labelUppercase,
  },
  title: {
    ...TYPOGRAPHY.headlineMd,
    fontSize: 20,
    lineHeight: 24,
    marginTop: 4,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: SPACING.md,
  },
  sectionKicker: {
    ...TYPOGRAPHY.labelUppercase,
  },
  themeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  themeTile: {
    flex: 1,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.md,
    minHeight: 74,
    justifyContent: 'space-between',
  },
  themeTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  limeDot: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.full,
  },
  themeTileLabel: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.displaySemiBold,
    marginTop: SPACING.sm,
  },
  helperText: {
    ...TYPOGRAPHY.bodySm,
  },
  hairline: {
    height: 1,
    marginVertical: SPACING.xl,
  },
  langRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  langTile: {
    flex: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  langLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    minWidth: 0,
  },
  langLabel: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.displaySemiBold,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  weightStepBtn: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightValueBox: {
    flex: 1,
    height: 46,
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
  },
  weightInput: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    minWidth: 42,
    paddingVertical: 0,
  },
  weightUnit: {
    ...TYPOGRAPHY.labelMd,
  },
  updateCard: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  updateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  versionText: {
    ...TYPOGRAPHY.cardTitle,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  updateDot: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
  },
  updateHint: {
    ...TYPOGRAPHY.bodySm,
  },
  updateBtn: {
    height: 46,
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  updateBtnText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.displaySemiBold,
  },
});

