import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { Route } from 'lucide-react-native';
import { GPSCoordinate } from '@/types/workout';
import { PALETTE } from '@/constants/Colors';
import { simplifyRouteForSilhouette } from '@/services/location/route-simplify';

interface RouteSilhouetteProps {
  routePoints: GPSCoordinate[];
  width: number;
  height: number;
  strokeColor?: string;
  strokeWidth?: number;
  startDotColor?: string;
  endDotColor?: string;
  fallbackColor?: string;
  padding?: number;
}

const MAX_RENDER_POINTS = 350;

export function RouteSilhouette({
  routePoints,
  width,
  height,
  strokeColor = PALETTE.accent,
  strokeWidth = 4,
  startDotColor = PALETTE.surfaceInverse,
  endDotColor = PALETTE.primary,
  fallbackColor = PALETTE.onSurfaceVariant,
  padding = 14,
}: RouteSilhouetteProps) {
  const projected = useMemo(() => {
    if (!routePoints || routePoints.length < 2 || width <= 0 || height <= 0) {
      return null;
    }

    const simplifiedSegments = simplifyRouteForSilhouette(
      routePoints,
      MAX_RENDER_POINTS
    );
    const sampled = simplifiedSegments.flat();
    if (sampled.length < 2) {
      return null;
    }

    const avgLat =
      sampled.reduce((sum, pt) => sum + pt.latitude, 0) / sampled.length;
    const cosLat = Math.max(0.1, Math.cos((avgLat * Math.PI) / 180));

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const pt of sampled) {
      const x = pt.longitude * cosLat;
      const y = -pt.latitude;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;

    if (spanX < 1e-8 && spanY < 1e-8) {
      return {
        isSingleSpot: true,
        segmentAttrs: [] as string[],
        start: { x: width / 2, y: height / 2 },
        end: { x: width / 2, y: height / 2 },
      };
    }

    const drawW = Math.max(1, width - padding * 2);
    const drawH = Math.max(1, height - padding * 2);

    const scaleX = spanX > 1e-9 ? drawW / spanX : Infinity;
    const scaleY = spanY > 1e-9 ? drawH / spanY : Infinity;
    const scale = Math.min(scaleX, scaleY);

    const renderedW = spanX * scale;
    const renderedH = spanY * scale;
    const offsetX = padding + (drawW - renderedW) / 2;
    const offsetY = padding + (drawH - renderedH) / 2;

    const project = (pt: GPSCoordinate) => ({
      x: Number((offsetX + (pt.longitude * cosLat - minX) * scale).toFixed(1)),
      y: Number((offsetY + (-pt.latitude - minY) * scale).toFixed(1)),
    });

    const segmentAttrs: string[] = [];
    for (const seg of simplifiedSegments) {
      if (seg.length > 1) {
        segmentAttrs.push(
          seg
            .map((pt) => {
              const p = project(pt);
              return `${p.x},${p.y}`;
            })
            .join(' ')
        );
      }
    }

    return {
      isSingleSpot: segmentAttrs.length === 0,
      segmentAttrs,
      start: project(sampled[0]),
      end: project(sampled[sampled.length - 1]),
    };
  }, [routePoints, width, height, padding]);

  if (!projected) {
    return (
      <View
        collapsable={false}
        style={[styles.fallbackBox, { width, height }]}
      >
        <Route size={36} color={fallbackColor} strokeWidth={1.75} />
      </View>
    );
  }

  return (
    <View collapsable={false} style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {!projected.isSingleSpot &&
          projected.segmentAttrs.map((pointsAttr, idx) => (
            <Polyline
              key={`seg-${idx}`}
              points={pointsAttr}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        {!projected.isSingleSpot && (
          <Circle
            cx={projected.start.x}
            cy={projected.start.y}
            r={Math.max(3, strokeWidth * 1.1)}
            fill={startDotColor}
            stroke={strokeColor}
            strokeWidth={1.5}
          />
        )}
        <Circle
          cx={projected.end.x}
          cy={projected.end.y}
          r={Math.max(3.5, strokeWidth * 1.3)}
          fill={endDotColor}
          stroke={strokeColor}
          strokeWidth={1.5}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
