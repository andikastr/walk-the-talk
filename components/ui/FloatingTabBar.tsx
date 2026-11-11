import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, BarChart2, Home, Music, Plus } from 'lucide-react-native';
import { FONT_FAMILY, RADIUS, SHADOWS } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';

type FloatingTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

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
  const { palette, isDark, t } = usePreferences();
  const bottomOffset = Math.max(insets.bottom, 16);

  const tabLabels: Record<string, string> = {
    index: t.tabs.home,
    record: t.tabs.record,
    history: t.tabs.history,
    music: t.tabs.music,
  };

  const visibleRoutes = state.routes.filter((route) => {
    const desc = descriptors[route.key];
    const opts = desc?.options as Record<string, unknown> | undefined;
    if (route.name === 'two' || opts?.href === null) return false;
    return route.name in tabLabels;
  });

  const renderIcon = (routeName: string, isFocused: boolean) => {
    if (routeName === 'record') {
      if (isFocused) {
        return <Activity size={18} strokeWidth={2} color={palette.onPrimary} />;
      }
      return <Plus size={20} strokeWidth={2} color={palette.surfaceFeature} />;
    }

    const color = isFocused ? palette.onPrimary : 'rgba(244, 242, 236, 0.7)';
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
      <View
        style={[
          styles.pillContainer,
          { backgroundColor: palette.surfaceFeature },
          isDark && { borderWidth: 1, borderColor: palette.border },
        ]}
      >
        {visibleRoutes.map((route) => {
          const routeIndex = state.routes.findIndex((r) => r.key === route.key);
          const isFocused = state.index === routeIndex;
          const { options } = descriptors[route.key];
          const label = tabLabels[route.name] ?? options.title ?? route.name;
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
                  ? [styles.activePill, { backgroundColor: palette.primary }]
                  : isRecordCreate
                  ? [styles.centerCreateCircle, { backgroundColor: palette.onFeature }]
                  : styles.inactiveCircle,
                pressed && { opacity: 0.78 },
              ]}
            >
              {renderIcon(route.name, isFocused)}
              {isFocused && (
                <Text style={[styles.activeLabel, { color: palette.onPrimary }]}>
                  {label}
                </Text>
              )}
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
    borderRadius: RADIUS.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
  },
  activeLabel: {
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
  },
});
