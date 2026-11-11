import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  ReduceMotion,
  css,
  cubicBezier,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BarChart2, Footprints, Home, Music } from 'lucide-react-native';
import { FONT_FAMILY, RADIUS, SHADOWS, SPACING } from '@/constants/Colors';
import { usePreferences } from '@/context/AppPreferencesContext';

type FloatingTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

type TabLayoutRect = {
  x: number;
  width: number;
};

const TAB_ORDER = ['index', 'record', 'history', 'music'] as const;
const PILL_EASE = Easing.bezier(0.23, 1, 0.32, 1);
const PRESS_EASE = cubicBezier(0.23, 1, 0.32, 1);

function renderTabIcon(routeName: string, color: string) {
  switch (routeName) {
    case 'index':
      return <Home size={18} strokeWidth={2} color={color} />;
    case 'record':
      return <Footprints size={18} strokeWidth={2} color={color} />;
    case 'history':
      return <BarChart2 size={18} strokeWidth={2} color={color} />;
    case 'music':
      return <Music size={18} strokeWidth={2} color={color} />;
    default:
      return <Home size={18} strokeWidth={2} color={color} />;
  }
}

interface FloatingTabItemProps {
  routeKey: string;
  routeName: string;
  label: string;
  accessibilityLabel: string;
  isFocused: boolean;
  activeColor: string;
  inactiveColor: string;
  reduced: boolean;
  onSlotLayout: (routeKey: string, layout: TabLayoutRect) => void;
  onPress: () => void;
  onLongPress: () => void;
}

function FloatingTabItem({
  routeKey,
  routeName,
  label,
  accessibilityLabel,
  isFocused,
  activeColor,
  inactiveColor,
  reduced,
  onSlotLayout,
  onPress,
  onLongPress,
}: FloatingTabItemProps) {
  const [pressed, setPressed] = useState(false);
  const focusProgress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      focusProgress.set(isFocused ? 1 : 0);
      return;
    }
    focusProgress.set(
      withTiming(isFocused ? 1 : 0, {
        duration: 200,
        easing: PILL_EASE,
        reduceMotion: ReduceMotion.System,
      })
    );
  }, [focusProgress, isFocused, reduced]);

  const inactiveIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - focusProgress.get(),
  }));

  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.get(),
  }));

  const labelColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focusProgress.get(), [0, 1], [inactiveColor, activeColor]),
  }));

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      onSlotLayout(routeKey, { x, width });
    },
    [onSlotLayout, routeKey]
  );

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      pressRetentionOffset={16}
      onLayout={handleLayout}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={styles.tabSlot}
    >
      <Animated.View
        style={[
          pressStyles.tabInner,
          !reduced && pressed && pressStyles.tabInnerPressed,
          reduced && pressed && { opacity: 0.78 },
        ]}
      >
        <View style={styles.iconStack}>
          <Animated.View style={[styles.iconLayer, inactiveIconStyle]}>
            {renderTabIcon(routeName, inactiveColor)}
          </Animated.View>
          <Animated.View style={[styles.iconLayer, activeIconStyle]}>
            {renderTabIcon(routeName, activeColor)}
          </Animated.View>
        </View>
        <Animated.Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={[styles.tabLabel, labelColorStyle]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Floating Ink Pill Bottom Tab Bar dengan 4 slot simetris dan sliding lime indicator.
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
  const reduced = useReducedMotion();
  const bottomOffset = Math.max(insets.bottom, 16);

  const tabLabels = useMemo<Record<string, string>>(
    () => ({
      index: t.tabs.home,
      record: t.tabs.record,
      history: t.tabs.history,
      music: t.tabs.music,
    }),
    [t.tabs.history, t.tabs.home, t.tabs.music, t.tabs.record]
  );

  const visibleRoutes = useMemo(() => {
    const orderMap = new Map<string, number>(
      TAB_ORDER.map((name, idx) => [name, idx])
    );

    return state.routes
      .filter((route) => {
        const desc = descriptors[route.key];
        const opts = desc?.options as Record<string, unknown> | undefined;
        if (opts?.href === null) return false;
        return route.name in tabLabels;
      })
      .sort(
        (a, b) =>
          (orderMap.get(a.name) ?? Number.MAX_SAFE_INTEGER) -
          (orderMap.get(b.name) ?? Number.MAX_SAFE_INTEGER)
      );
  }, [descriptors, state.routes, tabLabels]);

  const [layouts, setLayouts] = useState<Record<string, TabLayoutRect>>({});
  const hasInitializedPillRef = useRef(false);

  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const pillOpacity = useSharedValue(0);

  const handleSlotLayout = useCallback(
    (routeKey: string, layout: TabLayoutRect) => {
      setLayouts((prev) => {
        const existing = prev[routeKey];
        if (
          existing &&
          Math.abs(existing.x - layout.x) < 0.5 &&
          Math.abs(existing.width - layout.width) < 0.5
        ) {
          return prev;
        }
        return { ...prev, [routeKey]: layout };
      });
    },
    []
  );

  const activeRouteKey = state.routes[state.index]?.key;

  useEffect(() => {
    if (!activeRouteKey) return;
    const target = layouts[activeRouteKey];
    if (!target || target.width <= 0) return;

    if (!hasInitializedPillRef.current || reduced) {
      hasInitializedPillRef.current = true;
      pillX.set(target.x);
      pillW.set(target.width);
      pillOpacity.set(1);
      return;
    }

    pillOpacity.set(1);
    pillX.set(
      withTiming(target.x, {
        duration: 240,
        easing: PILL_EASE,
        reduceMotion: ReduceMotion.System,
      })
    );
    pillW.set(
      withTiming(target.width, {
        duration: 240,
        easing: PILL_EASE,
        reduceMotion: ReduceMotion.System,
      })
    );
  }, [activeRouteKey, layouts, pillOpacity, pillW, pillX, reduced]);

  const slidingPillStyle = useAnimatedStyle(() => ({
    opacity: pillOpacity.get(),
    width: pillW.get(),
    transform: [{ translateX: pillX.get() }],
  }));

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: bottomOffset }]}>
      <View
        style={[
          styles.pillContainer,
          { backgroundColor: palette.surfaceFeature },
          isDark && { borderWidth: 1, borderColor: palette.border },
        ]}
      >
        <View style={styles.tabsTrack}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.slidingPill,
              { backgroundColor: palette.primary },
              slidingPillStyle,
            ]}
          />

          {visibleRoutes.map((route) => {
            const routeIndex = state.routes.findIndex((r) => r.key === route.key);
            const isFocused = state.index === routeIndex;
            const { options } = descriptors[route.key];
            const label = tabLabels[route.name] ?? options.title ?? route.name;

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
              <FloatingTabItem
                key={route.key}
                routeKey={route.key}
                routeName={route.name}
                label={label}
                accessibilityLabel={options.tabBarAccessibilityLabel || label}
                isFocused={isFocused}
                activeColor={palette.onPrimary}
                inactiveColor={palette.onFeatureMuted}
                reduced={reduced}
                onSlotLayout={handleSlotLayout}
                onPress={onPress}
                onLongPress={onLongPress}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const pressStyles = css.create({
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 3,
    transform: [{ scale: 1 }],
    transitionProperty: 'transform',
    transitionDuration: '120ms',
    transitionTimingFunction: PRESS_EASE,
  },
  tabInnerPressed: {
    transform: [{ scale: 0.96 }],
  },
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    zIndex: 30,
  },
  pillContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: RADIUS.full,
    padding: 5,
    boxShadow: SHADOWS.floatingNav,
  },
  tabsTrack: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  slidingPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: RADIUS.full,
  },
  tabSlot: {
    flex: 1,
    minHeight: 48,
    borderRadius: RADIUS.full,
    justifyContent: 'center',
  },
  iconStack: {
    width: 18,
    height: 18,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: FONT_FAMILY.bodySemiBold,
    fontSize: 10.5,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
});
