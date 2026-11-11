import React, { useEffect } from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
} from 'lucide-react-native';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';

export type AppDialogTone = 'confirm' | 'destructive' | 'error' | 'info' | 'success';

export interface AppDialogAction {
  id?: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  onPress?: () => void | Promise<void>;
}

export interface AppDialogOverlayProps {
  visible: boolean;
  inline?: boolean;
  kicker?: string;
  title: string;
  message?: string;
  tone?: AppDialogTone;
  dismissible?: boolean;
  actions: AppDialogAction[];
  onDismiss?: () => void;
}

const SHORT_HORIZONTAL_TOTAL_CHARS = 24;

export function AppDialogOverlay({
  visible,
  inline = false,
  kicker,
  title,
  message,
  tone = 'info',
  dismissible,
  actions,
  onDismiss,
}: AppDialogOverlayProps) {
  const { palette, isDark, t } = usePreferences();

  const canDismiss = dismissible ?? (tone !== 'destructive' && actions.length <= 1);

  useEffect(() => {
    if (!inline || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canDismiss && onDismiss) {
        onDismiss();
      }
      return true;
    });
    return () => sub.remove();
  }, [inline, visible, canDismiss, onDismiss]);

  if (!visible) return null;

  const resolvedKicker =
    kicker ??
    (tone === 'confirm'
      ? t.common.confirmKicker
      : tone === 'destructive'
      ? t.common.warningKicker
      : tone === 'error'
      ? t.common.errorKicker
      : tone === 'success'
      ? t.common.successKicker
      : t.common.infoKicker);

  const renderBadge = () => {
    if (tone === 'destructive') {
      return (
        <View style={[styles.iconBadge, { backgroundColor: palette.emberTint }]}>
          <AlertTriangle size={20} strokeWidth={2} color={palette.accent} />
        </View>
      );
    }
    if (tone === 'error') {
      return (
        <View style={[styles.iconBadge, { backgroundColor: palette.emberTint }]}>
          <AlertCircle size={20} strokeWidth={2} color={palette.accent} />
        </View>
      );
    }
    if (tone === 'success') {
      return (
        <View style={[styles.iconBadge, { backgroundColor: palette.primary }]}>
          <CheckCircle2 size={20} strokeWidth={2} color={palette.onPrimary} />
        </View>
      );
    }
    if (tone === 'confirm') {
      return (
        <View style={[styles.iconBadge, { backgroundColor: palette.modalSurfaceAlt }]}>
          <HelpCircle size={20} strokeWidth={2} color={palette.onSurface} />
        </View>
      );
    }
    return (
      <View style={[styles.iconBadge, { backgroundColor: palette.modalSurfaceAlt }]}>
        <Info size={20} strokeWidth={2} color={palette.onSurface} />
      </View>
    );
  };

  const totalLabelLen = actions.reduce((sum, a) => sum + a.label.length, 0);
  const useHorizontalLayout = actions.length === 2 && totalLabelLen <= SHORT_HORIZONTAL_TOTAL_CHARS;
  const displayActions =
    useHorizontalLayout || actions.length <= 1 ? actions : [...actions].reverse();

  const handleBackdropPress = () => {
    if (canDismiss && onDismiss) {
      onDismiss();
    }
  };

  const content = (
    <View
      style={[
        inline ? styles.inlineBackdrop : styles.backdrop,
        { backgroundColor: palette.backdrop },
      ]}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress} />

      <View
        style={[
          styles.card,
          { backgroundColor: palette.modalSurface },
          isDark && { borderWidth: 1, borderColor: palette.border },
        ]}
      >
        <View style={styles.topMetaRow}>
          {renderBadge()}
          <Text
            style={[styles.kicker, { color: palette.onSurfaceVariant }]}
            numberOfLines={1}
          >
            {resolvedKicker}
          </Text>
        </View>

        <Text style={[styles.title, { color: palette.onSurface }]}>{title}</Text>

        {message ? (
          <Text style={[styles.message, { color: palette.onSurfaceVariant }]}>
            {message}
          </Text>
        ) : null}

        <View
          style={[
            styles.actionsContainer,
            useHorizontalLayout ? styles.actionsRow : styles.actionsStack,
          ]}
        >
          {displayActions.map((action, index) => {
            const variant =
              action.variant ??
              (actions.length === 1
                ? 'primary'
                : index === actions.length - 1
                ? tone === 'destructive'
                  ? 'destructive'
                  : 'primary'
                : 'secondary');

            const btnBg =
              variant === 'destructive'
                ? palette.accent
                : variant === 'primary'
                ? palette.actionPrimary
                : palette.modalSurfaceAlt;

            const btnText =
              variant === 'destructive'
                ? '#F4F2EC'
                : variant === 'primary'
                ? palette.onActionPrimary
                : palette.onSurface;

            return (
              <Pressable
                key={action.id ?? `${action.label}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.actionBtn,
                  useHorizontalLayout ? styles.actionBtnFlex : styles.actionBtnFull,
                  { backgroundColor: btnBg },
                  pressed && { opacity: 0.82 },
                ]}
              >
                <Text style={[styles.actionBtnText, { color: btnText }]} numberOfLines={1}>
                  {action.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );

  if (inline) {
    return content;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleBackdropPress}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.gutter,
  },
  inlineBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 99,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.gutter,
  },
  card: {
    width: '100%',
    maxWidth: 372,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.xxl,
  },
  topMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    ...TYPOGRAPHY.labelUppercase,
    flex: 1,
  },
  title: {
    fontFamily: FONT_FAMILY.displayBold,
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.4,
    marginBottom: SPACING.sm,
  },
  message: {
    ...TYPOGRAPHY.bodyMd,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  actionsContainer: {
    gap: SPACING.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsStack: {
    flexDirection: 'column',
  },
  actionBtn: {
    minHeight: 46,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnFlex: {
    flex: 1,
  },
  actionBtnFull: {
    width: '100%',
  },
  actionBtnText: {
    fontFamily: FONT_FAMILY.displaySemiBold,
    fontSize: 14,
    letterSpacing: -0.14,
  },
});
