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
import { FONT_FAMILY, PALETTE, RADIUS, SPACING, TYPOGRAPHY } from '@/constants/Colors';
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
  const renderDeviceIcon = (type: string, isActive: boolean) => {
    const color = isActive ? PALETTE.onInverse : PALETTE.onSurface;
    const t = type.toLowerCase();
    if (t.includes('computer')) return <Monitor size={20} strokeWidth={2} color={color} />;
    if (t.includes('smartphone')) return <Smartphone size={20} strokeWidth={2} color={color} />;
    if (t.includes('speaker')) return <Volume2 size={20} strokeWidth={2} color={color} />;
    return <Cpu size={20} strokeWidth={2} color={color} />;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.kicker}>SPOTIFY CONNECT</Text>
              <Text style={styles.title}>Pilih Perangkat Pemutar</Text>
              <SpotifyAttribution size="small" variant="light" />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tutup modal perangkat"
              onPress={onClose}
              style={({ pressed }) => [styles.closeIconBtn, pressed && { opacity: 0.7 }]}
            >
              <X size={18} strokeWidth={2} color={PALETTE.onSurface} />
            </Pressable>
          </View>

          {devices.length === 0 ? (
            <View style={styles.emptyContainer}>
              <AlertCircle size={32} strokeWidth={2} color={PALETTE.onSurfaceVariant} />
              <Text style={styles.emptyText}>Tidak ada perangkat aktif terdeteksi.</Text>
              <Text style={styles.emptyHint}>
                Buka aplikasi Spotify di smartphone, tablet, atau komputer Anda lalu putar satu lagu.
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
                      isActive && styles.deviceItemActive,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => item.id && onSelect(item.id)}
                  >
                    {renderDeviceIcon(item.type, isActive)}
                    <View style={styles.deviceInfo}>
                      <Text
                        style={[
                          styles.deviceName,
                          isActive && { color: PALETTE.onInverse },
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.deviceType,
                          isActive && { color: PALETTE.onInverseMuted },
                        ]}
                      >
                        {item.type}
                      </Text>
                    </View>
                    {isActive && (
                      <Check size={18} strokeWidth={2.2} color={PALETTE.primary} />
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.85 }]}
            onPress={onClose}
          >
            <Text style={styles.closeButtonText}>Tutup</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14, 15, 12, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: PALETTE.surface,
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
    color: PALETTE.onSurfaceVariant,
  },
  title: {
    ...TYPOGRAPHY.headlineMd,
    color: PALETTE.onSurface,
  },
  closeIconBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: PALETTE.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    backgroundColor: PALETTE.surfaceAlt,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    ...TYPOGRAPHY.headlineSm,
    color: PALETTE.onSurface,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  emptyHint: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onSurfaceVariant,
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
    backgroundColor: PALETTE.surfaceAlt,
  },
  deviceItemActive: {
    backgroundColor: PALETTE.surfaceInverse,
  },
  deviceInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  deviceName: {
    ...TYPOGRAPHY.cardTitle,
    fontSize: 15,
    color: PALETTE.onSurface,
  },
  deviceType: {
    ...TYPOGRAPHY.bodySm,
    color: PALETTE.onSurfaceVariant,
  },
  closeButton: {
    backgroundColor: PALETTE.surfaceInverse,
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
    color: PALETTE.onInverse,
  },
});
