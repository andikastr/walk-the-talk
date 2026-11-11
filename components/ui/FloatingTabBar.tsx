import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, BarChart2, Home, Music, Plus } from 'lucide-react-native';
import { FONT_FAMILY, PALETTE, RADIUS, SHADOWS } from '@/constants/Colors';

type FloatingTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

const TAB_CONFIG: Record<string, { label: string }> = {
  index: { label: 'Beranda' },
  record: { label: 'Rekam' },
  history: { label: 'Riwayat' },
  music: { label: 'Musik' },
};

/**
 * Floating Ink Pill Bottom Tab Bar sesuai DESIGN.md ("tab-bar (floating)").
 * Satu-satunya elemen dalam aplikasi yang membawa cta-shadow.
 */
export function FloatingTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
}: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 16);

  const visibleRoutes = state.routes.filter((route) => {
    const desc = descriptors[route.key];
    const opts = desc?.options as Record<string, unknown> | undefined;
    if (route.name === 'two' || opts?.href === null) return false;
    return route.name in TAB_CONFIG;
  });

  const renderIcon = (routeName: string, isFocused: boolean) => {
    if (routeName === 'record') {
      if (isFocused) {
        return <Activity size={18} strokeWidth={2} color={PALETTE.onPrimary} />;
      }
      return <Plus size={20} strokeWidth={2} color={PALETTE.onSurface} />;
    }

    const color = isFocused ? PALETTE.onPrimary : 'rgba(244, 242, 236, 0.7)';
    switch (routeName) {
      case 'index':
        return <Home size={18} strokeWidth={2} color={color} />;
      case 'history':
        return <BarChart2 size={18} strokeWidth={2} color={color} />;
      case 'music':
        return <Music size={18} strokeWidth={2} color={color} />;
      default:
        return <Home size={18} strokeWidth={2} color={color} />;
    }
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: bottomOffset }]}>
      <View style={styles.pillContainer}>
        {visibleRoutes.map((route) => {
          const routeIndex = state.routes.findIndex((r) => r.key === route.key);
          const isFocused = state.index === routeIndex;
          const { options } = descriptors[route.key];
          const label = TAB_CONFIG[route.name]?.label ?? options.title ?? route.name;
          const isRecordCreate = route.name === 'record' && !isFocused;

          const onPress = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigateToTab(route.key);
            }
          };

          const onLongPress = () => {
            emitter.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel || label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                isFocused
                  ? styles.activePill
                  : isRecordCreate
                  ? styles.centerCreateCircle
                  : styles.inactiveCircle,
                pressed && { opacity: 0.78 },
              ]}
            >
              {renderIcon(route.name, isFocused)}
              {isFocused && <Text style={styles.activeLabel}>{label}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.surfaceInverse,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 60,
    gap: 6,
    boxShadow: SHADOWS.floatingNav,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
  },
  activeLabel: {
    color: PALETTE.onPrimary,
    fontFamily: FONT_FAMILY.bodySemiBold,
    fontSize: 12,
    letterSpacing: -0.12,
  },
  inactiveCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  centerCreateCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.surface,
  },
});
