import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';
import { AppDialogOverlay } from '@/components/ui/AppDialogOverlay';
import { KickerText } from '@/components/ui/EditorialPrimitives';

interface SpotifyManualAuthModalProps {
  visible: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmitUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
  onSuccess: () => void;
}

export function SpotifyManualAuthModal({
  visible,
  isSubmitting,
  onClose,
  onSubmitUrl,
  onSuccess,
}: SpotifyManualAuthModalProps) {
  const { palette, isDark, t } = usePreferences();
  const [pastedLink, setPastedLink] = useState('');
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: '' });

  const resetFormState = () => {
    setPastedLink('');
    setErrorModal({ visible: false, message: '' });
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetFormState();
    onClose();
  };

  const handleConfirm = async () => {
    const trimmed = pastedLink.trim();
    if (!trimmed || isSubmitting) return;

    const res = await onSubmitUrl(trimmed);
    if (res.success) {
      resetFormState();
      onClose();
      onSuccess();
    } else {
      setErrorModal({
        visible: true,
        message: res.error || t.music.manualFailMessage,
      });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onShow={resetFormState}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardRoot}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: palette.backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

          <View
            style={[
              styles.card,
              { backgroundColor: palette.modalSurface },
              isDark && { borderWidth: 1, borderColor: palette.border },
            ]}
          >
            <KickerText>{t.music.manualKicker}</KickerText>
            <Text style={[styles.title, { color: palette.onSurface }]}>
              {t.music.manualTitle}
            </Text>
            <Text style={[styles.desc, { color: palette.onSurfaceVariant }]}>
              {t.music.manualDesc}
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: palette.modalSurfaceAlt,
                  color: palette.onSurface,
                },
                isDark && { borderWidth: 1, borderColor: palette.border },
              ]}
              value={pastedLink}
              onChangeText={setPastedLink}
              placeholder={t.music.manualPlaceholder}
              placeholderTextColor={palette.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  { backgroundColor: palette.modalSurfaceAlt },
                  pressed && { opacity: 0.75 },
                ]}
                onPress={handleClose}
              >
                <Text style={[styles.cancelBtnText, { color: palette.onSurface }]}>
                  {t.common.cancel}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.submitBtn,
                  { backgroundColor: palette.actionPrimary },
                  (!pastedLink.trim() || isSubmitting) && { opacity: 0.5 },
                  pressed && { opacity: 0.85 },
                ]}
                disabled={!pastedLink.trim() || isSubmitting}
                onPress={handleConfirm}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={palette.onActionPrimary} />
                ) : (
                  <Text style={[styles.submitBtnText, { color: palette.onActionPrimary }]}>
                    {t.music.manualSubmit}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

          <AppDialogOverlay
            inline
            visible={errorModal.visible}
            tone="error"
            title={t.music.manualFailTitle}
            message={errorModal.message}
            onDismiss={() => setErrorModal({ visible: false, message: '' })}
            actions={[
              {
                id: 'ok',
                label: t.common.ok,
                variant: 'primary',
                onPress: () => setErrorModal({ visible: false, message: '' }),
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.gutter,
  },
  card: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.xxl,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    ...TYPOGRAPHY.headlineMd,
    fontSize: 20,
    marginTop: 6,
    marginBottom: SPACING.sm,
  },
  desc: {
    ...TYPOGRAPHY.bodySm,
    lineHeight: 19,
    marginBottom: SPACING.lg,
  },
  input: {
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    ...TYPOGRAPHY.bodyMd,
    marginBottom: SPACING.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
  submitBtn: {
    flex: 1.4,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.displaySemiBold,
  },
});

