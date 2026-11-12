import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { GPSCoordinate } from '@/types/workout';
import { LIGHT_PALETTE, PALETTE } from '@/constants/Colors';
import { MAP_CONFIG } from '@/constants/Config';
import {
  computeStaticMapPlan,
  StaticMapTheme,
} from '@/services/location/static-map';
import { RouteSilhouette } from '@/components/workout/RouteSilhouette';

interface ShareRouteMapProps {
  routePoints: GPSCoordinate[];
  width: number;
  height: number;
  theme?: StaticMapTheme;
  strokeColor?: string;
  strokeWidth?: number;
  startDotColor?: string;
  endDotColor?: string;
  fallbackColor?: string;
  onTilesSettledChange?: (settled: boolean) => void;
}

const GRID_STEP = 28;

export function ShareRouteMap({
  routePoints,
  width,
  height,
  theme = 'light',
  strokeColor = PALETTE.accent,
  strokeWidth = 4,
  startDotColor = PALETTE.surfaceInverse,
  endDotColor = PALETTE.primary,
  fallbackColor = PALETTE.onSurfaceVariant,
  onTilesSettledChange,
}: ShareRouteMapProps) {
  const plan = useMemo(
    () =>
      computeStaticMapPlan({
        routePoints,
        width,
        height,
        padding: 18,
        theme,
        cartoApiKey: MAP_CONFIG.cartoApiKey,
      }),
    [routePoints, width, height, theme]
  );

  const tileKeysSignature = useMemo(
    () => (plan ? plan.tiles.map((t) => t.key).join('|') : ''),
    [plan]
  );
  const settledTrackerRef = useRef<{ signature: string; keys: Set<string> }>({
    signature: '',
    keys: new Set(),
  });

  useEffect(() => {
    const total = plan?.tiles.length ?? 0;
    settledTrackerRef.current = {
      signature: tileKeysSignature,
      keys: new Set(),
    };
    onTilesSettledChange?.(total === 0);
  }, [tileKeysSignature, plan?.tiles.length, onTilesSettledChange]);

  const markTileSettled = useCallback(
    (key: string, totalTiles: number) => {
      if (settledTrackerRef.current.signature !== tileKeysSignature) {
        return;
      }
      settledTrackerRef.current.keys.add(key);
      if (settledTrackerRef.current.keys.size >= totalTiles) {
        onTilesSettledChange?.(true);
      }
    },
    [tileKeysSignature, onTilesSettledChange]
  );

  const isDark = theme === 'dark';
  const gridStroke = isDark
    ? 'rgba(244, 242, 236, 0.06)'
    : 'rgba(14, 15, 12, 0.05)';
  const routeCasingStroke = isDark
    ? 'rgba(14, 15, 12, 0.78)'
    : 'rgba(14, 15, 12, 0.42)';
  const tileRequestHeaders = useMemo(
    () =>
      plan?.usesCarto
        ? undefined
        : { 'User-Agent': 'WalkTheTalk-RunningApp/1.0 (Expo)' },
    [plan?.usesCarto]
  );

  const gridLines = useMemo(() => {
    const vertical: number[] = [];
    const horizontal: number[] = [];
    for (let x = GRID_STEP; x < width; x += GRID_STEP) {
      vertical.push(x);
    }
    for (let y = GRID_STEP; y < height; y += GRID_STEP) {
      horizontal.push(y);
    }
    return { vertical, horizontal };
  }, [width, height]);

  if (!plan || plan.segments.length === 0) {
    return (
      <View
        style={[
          styles.container,
          {
            width,
            height,
            backgroundColor: isDark ? '#1A1D18' : LIGHT_PALETTE.surfaceAlt,
          },
        ]}
      >
        <RouteSilhouette
          routePoints={routePoints}
          width={width}
          height={height}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          startDotColor={startDotColor}
          endDotColor={endDotColor}
          fallbackColor={fallbackColor}
        />
      </View>
    );
  }

  return (
    <View
      collapsable={false}
      style={[
        styles.container,
        {
          width,
          height,
          backgroundColor: isDark ? '#191C17' : '#E7EAE2',
        },
      ]}
    >
      {/* Editorial fallback grid shown cleanly if tiles are offline */}
      <Svg
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        {gridLines.vertical.map((x) => (
          <Line
            key={`v-${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke={gridStroke}
            strokeWidth={1}
          />
        ))}
        {gridLines.horizontal.map((y) => (
          <Line
            key={`h-${y}`}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={gridStroke}
            strokeWidth={1}
          />
        ))}
      </Svg>

      {/* Slippy XYZ Web Mercator Basemap Tiles */}
      {plan.tiles.map((tile) => (
        <Image
          key={tile.key}
          source={
            tileRequestHeaders
              ? { uri: tile.url, headers: tileRequestHeaders }
              : { uri: tile.url }
          }
          fadeDuration={0}
          resizeMode="cover"
          onLoad={() => markTileSettled(tile.key, plan.tiles.length)}
          onError={() => markTileSettled(tile.key, plan.tiles.length)}
          style={{
            position: 'absolute',
            left: tile.left,
            top: tile.top,
            width: tile.size,
            height: tile.size,
          }}
        />
      ))}

      {/* Contrast glaze so route trail always pops clearly */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark
              ? plan.usesCarto
                ? 'rgba(14, 15, 12, 0.12)'
                : 'rgba(14, 15, 12, 0.36)'
              : plan.usesCarto
                ? 'rgba(244, 242, 236, 0.06)'
                : 'rgba(244, 242, 236, 0.14)',
          },
        ]}
      />

      {/* Aligned GPS Route Polyline Overlay */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {plan.segments.map((segment, index) => {
          const pointsAttr = segment
            .map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
            .join(' ');
          return (
            <React.Fragment key={`seg-${index}`}>
              <Polyline
                points={pointsAttr}
                fill="none"
                stroke={routeCasingStroke}
                strokeWidth={strokeWidth + 3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Polyline
                points={pointsAttr}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </React.Fragment>
          );
        })}

        {plan.startPoint && (
          <>
            <Circle
              cx={plan.startPoint.x}
              cy={plan.startPoint.y}
              r={6.5}
              fill={LIGHT_PALETTE.surface}
            />
            <Circle
              cx={plan.startPoint.x}
              cy={plan.startPoint.y}
              r={4.2}
              fill={startDotColor}
            />
          </>
        )}

        {plan.endPoint && (
          <>
            <Circle
              cx={plan.endPoint.x}
              cy={plan.endPoint.y}
              r={7}
              fill={LIGHT_PALETTE.surface}
            />
            <Circle
              cx={plan.endPoint.x}
              cy={plan.endPoint.y}
              r={4.8}
              fill={endDotColor}
            />
          </>
        )}
      </Svg>

      {/* Map Tile Attribution Pill */}
      <View
        pointerEvents="none"
        style={[
          styles.attributionBadge,
          {
            backgroundColor: isDark
              ? 'rgba(14, 15, 12, 0.72)'
              : 'rgba(244, 242, 236, 0.82)',
          },
        ]}
      >
        <Text
          style={[
            styles.attributionText,
            { color: isDark ? LIGHT_PALETTE.onInverse : LIGHT_PALETTE.onSurface },
          ]}
        >
          {plan.attribution}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  attributionBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  attributionText: {
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

