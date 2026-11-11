import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
} from 'react-native';
import {
  AlertCircle,
  Check,
  Cpu,
  Monitor,
  Smartphone,
  Volume2,
  X,
} from 'lucide-react-native';
import { SpotifyDevice } from '@/types/spotify';
import { FONT_FAMILY, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';
import { SpotifyAttribution } from './SpotifyAttribution';

interface DevicePickerModalProps {
  visible: boolean;
  devices: SpotifyDevice[];
  activeDevice: SpotifyDevice | null;
  onSelect: (deviceId: string) => void;
  onClose: () => void;
}

export function DevicePickerModal({
  visible,
  devices,
  activeDevice,
  onSelect,
  onClose,
}: DevicePickerModalProps) {
  const { palette, isDark, t } = usePreferences();

  const renderDeviceIcon = (type: string, isActive: boolean) => {
    const color = isActive ? palette.onFeature : palette.onSurface;
    const deviceType = type.toLowerCase();
    if (deviceType.includes('computer')) return <Monitor size={20} strokeWidth={2} color={color} />;
    if (deviceType.includes('smartphone')) return <Smartphone size={20} strokeWidth={2} color={color} />;
    if (deviceType.includes('speaker')) return <Volume2 size={20} strokeWidth={2} color={color} />;
    return <Cpu size={20} strokeWidth={2} color={color} />;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: palette.backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.dialog,
            { backgroundColor: palette.modalSurface },
            isDark && { borderWidth: 1, borderColor: palette.border },
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.kicker, { color: palette.onSurfaceVariant }]}>
                {t.music.deviceModalKicker}
              </Text>
              <Text style={[styles.title, { color: palette.onSurface }]}>
                {t.music.deviceModalTitle}
              </Text>
              <SpotifyAttribution size="small" variant="light" />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.music.deviceModalCloseA11y}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeIconBtn,
                { backgroundColor: palette.modalSurfaceAlt },
                pressed && { opacity: 0.7 },
              ]}
            >
              <X size={18} strokeWidth={2} color={palette.onSurface} />
            </Pressable>
          </View>

          {devices.length === 0 ? (
            <View
              style={[
                styles.emptyContainer,
                { backgroundColor: palette.modalSurfaceAlt },
              ]}
            >
              <AlertCircle size={32} strokeWidth={2} color={palette.onSurfaceVariant} />
              <Text style={[styles.emptyText, { color: palette.onSurface }]}>
                {t.music.deviceModalEmpty}
              </Text>
              <Text style={[styles.emptyHint, { color: palette.onSurfaceVariant }]}>
                {t.music.deviceModalEmptyHint}
              </Text>
            </View>
          ) : (
            <FlatList
              data={devices}
              keyExtractor={(item, index) => item.id || `device-${index}`}
              style={{ maxHeight: 280 }}
              renderItem={({ item }) => {
                const isActive = item.is_active || item.id === activeDevice?.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    style={({ pressed }) => [
                      styles.deviceItem,
                      {
                        backgroundColor: isActive
                          ? palette.surfaceFeature
                          : palette.modalSurfaceAlt,
                      },
                      isActive &&
                        isDark && { borderWidth: 1, borderColor: palette.primary },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => item.id && onSelect(item.id)}
                  >
                    {renderDeviceIcon(item.type, isActive)}
                    <View style={styles.deviceInfo}>
                      <Text
                        style={[
                          styles.deviceName,
                          { color: isActive ? palette.onFeature : palette.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.deviceType,
                          {
                            color: isActive
                              ? palette.onFeatureMuted
                              : palette.onSurfaceVariant,
                          },
                        ]}
                      >
                        {item.type}
                      </Text>
                    </View>
                    {isActive && (
                      <Check size={18} strokeWidth={2.2} color={palette.primary} />
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.closeButton,
              { backgroundColor: palette.actionPrimary },
              pressed && { opacity: 0.85 },
            ]}
            onPress={onClose}
          >
            <Text style={[styles.closeButtonText, { color: palette.onActionPrimary }]}>
              {t.common.close}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    padding: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
  },
  kicker: {
    ...TYPOGRAPHY.labelUppercase,
  },
  title: {
    ...TYPOGRAPHY.headlineMd,
  },
  closeIconBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    ...TYPOGRAPHY.headlineSm,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  emptyHint: {
    ...TYPOGRAPHY.bodySm,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    marginBottom: SPACING.sm,
  },
  deviceInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  deviceName: {
    ...TYPOGRAPHY.cardTitle,
    fontSize: 15,
  },
  deviceType: {
    ...TYPOGRAPHY.bodySm,
  },
  closeButton: {
    height: 44,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  closeButtonText: {
    ...TYPOGRAPHY.labelMd,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
});
