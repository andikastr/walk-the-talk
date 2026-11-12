import { GPSCoordinate } from '@/types/workout';
import { simplifyRouteForSilhouette } from '@/services/location/route-simplify';

export type StaticMapTheme = 'light' | 'dark';

export interface StaticTileDescriptor {
  key: string;
  url: string;
  x: number;
  y: number;
  z: number;
  left: number;
  top: number;
  size: number;
}

export interface ProjectedMapPoint {
  x: number;
  y: number;
}

export interface StaticMapPlan {
  zoom: number;
  width: number;
  height: number;
  tiles: StaticTileDescriptor[];
  segments: ProjectedMapPoint[][];
  startPoint: ProjectedMapPoint | null;
  endPoint: ProjectedMapPoint | null;
  attribution: string;
  usesCarto: boolean;
  isSinglePoint: boolean;
}

export interface ComputeStaticMapOptions {
  routePoints: GPSCoordinate[];
  width: number;
  height: number;
  padding?: number;
  theme?: StaticMapTheme;
  cartoApiKey?: string;
}

export const STATIC_MAP_TILE_SIZE = 256;
export const STATIC_MAP_MIN_ZOOM = 2;
export const STATIC_MAP_MAX_ZOOM = 17;
export const STATIC_MAP_SINGLE_POINT_ZOOM = 16;

const MAX_MERCATOR_LAT = 85.05112878;
const MAX_RENDER_POINTS = 350;
const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'] as const;

export function buildOsmTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export function latLngToWorldNorm(
  latitude: number,
  longitude: number
): { x: number; y: number } {
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, latitude));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const x = (longitude + 180) / 360;
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return { x, y };
}

export function buildStaticTileUrl(
  z: number,
  x: number,
  y: number,
  theme: StaticMapTheme,
  cartoApiKey: string = ''
): { url: string; usesCarto: boolean } {
  const trimmedKey = cartoApiKey.trim();
  if (trimmedKey.length > 0) {
    const sub = CARTO_SUBDOMAINS[Math.abs(x + y) % CARTO_SUBDOMAINS.length];
    const style = theme === 'dark' ? 'dark_all' : 'light_all';
    return {
      url: `https://${sub}.basemaps.cartocdn.com/${style}/${z}/${x}/${y}@2x.png?key=${encodeURIComponent(
        trimmedKey
      )}`,
      usesCarto: true,
    };
  }

  return {
    url: buildOsmTileUrl(z, x, y),
    usesCarto: false,
  };
}

function buildTileGrid(
  zoom: number,
  originPxX: number,
  originPxY: number,
  width: number,
  height: number,
  theme: StaticMapTheme,
  cartoApiKey: string
): { tiles: StaticTileDescriptor[]; usesCarto: boolean } {
  const tileCountPerAxis = Math.pow(2, zoom);
  const maxTileIdx = tileCountPerAxis - 1;
  const startTileX = Math.floor(originPxX / STATIC_MAP_TILE_SIZE);
  const endTileX = Math.floor((originPxX + width - 0.001) / STATIC_MAP_TILE_SIZE);
  const startTileY = Math.max(0, Math.floor(originPxY / STATIC_MAP_TILE_SIZE));
  const endTileY = Math.min(
    maxTileIdx,
    Math.floor((originPxY + height - 0.001) / STATIC_MAP_TILE_SIZE)
  );

  const tiles: StaticTileDescriptor[] = [];
  let usesCarto = false;

  for (let ty = startTileY; ty <= endTileY; ty += 1) {
    for (let tx = startTileX; tx <= endTileX; tx += 1) {
      const wrappedTx = ((tx % tileCountPerAxis) + tileCountPerAxis) % tileCountPerAxis;
      const tileInfo = buildStaticTileUrl(zoom, wrappedTx, ty, theme, cartoApiKey);
      usesCarto = tileInfo.usesCarto;
      tiles.push({
        key: `${zoom}-${wrappedTx}-${ty}-${theme}`,
        url: tileInfo.url,
        x: wrappedTx,
        y: ty,
        z: zoom,
        left: tx * STATIC_MAP_TILE_SIZE - originPxX,
        top: ty * STATIC_MAP_TILE_SIZE - originPxY,
        size: STATIC_MAP_TILE_SIZE,
      });
    }
  }

  return { tiles, usesCarto };
}

/**
 * Computes Web Mercator Slippy XYZ tiles covering the viewport plus exact pixel
 * polyline coordinates (or a single-point center pin when only 1 GPS fix exists).
 */
export function computeStaticMapPlan({
  routePoints,
  width,
  height,
  padding = 18,
  theme = 'light',
  cartoApiKey = '',
}: ComputeStaticMapOptions): StaticMapPlan | null {
  if (!routePoints || routePoints.length === 0 || width <= 0 || height <= 0) {
    return null;
  }

  const simplifiedSegments =
    routePoints.length === 1
      ? [[routePoints[0]]]
      : simplifyRouteForSilhouette(routePoints, MAX_RENDER_POINTS);
  const flatPoints = simplifiedSegments.flat();
  if (flatPoints.length === 0) {
    return null;
  }

  if (flatPoints.length === 1) {
    const singleZoom = Math.min(STATIC_MAP_MAX_ZOOM, STATIC_MAP_SINGLE_POINT_ZOOM);
    const worldPx = STATIC_MAP_TILE_SIZE * Math.pow(2, singleZoom);
    const norm = latLngToWorldNorm(flatPoints[0].latitude, flatPoints[0].longitude);
    const originPxX = norm.x * worldPx - width / 2;
    const originPxY = norm.y * worldPx - height / 2;
    const { tiles, usesCarto } = buildTileGrid(
      singleZoom,
      originPxX,
      originPxY,
      width,
      height,
      theme,
      cartoApiKey
    );

    return {
      zoom: singleZoom,
      width,
      height,
      tiles,
      segments: [],
      startPoint: { x: width / 2, y: height / 2 },
      endPoint: null,
      attribution: usesCarto ? '© OpenStreetMap · © CARTO' : '© OpenStreetMap',
      usesCarto,
      isSinglePoint: true,
    };
  }

  const normalizedSegments = simplifiedSegments.map((segment) =>
    segment.map((pt) => latLngToWorldNorm(pt.latitude, pt.longitude))
  );
  const flatNorm = normalizedSegments.flat();

  let minXNorm = Infinity;
  let maxXNorm = -Infinity;
  let minYNorm = Infinity;
  let maxYNorm = -Infinity;

  for (const pt of flatNorm) {
    if (pt.x < minXNorm) minXNorm = pt.x;
    if (pt.x > maxXNorm) maxXNorm = pt.x;
    if (pt.y < minYNorm) minYNorm = pt.y;
    if (pt.y > maxYNorm) maxYNorm = pt.y;
  }

  const spanXNorm = Math.max(1e-8, maxXNorm - minXNorm);
  const spanYNorm = Math.max(1e-8, maxYNorm - minYNorm);
  const safePadding = Math.min(padding, Math.floor(Math.min(width, height) * 0.2));
  const paddedWidth = Math.max(24, width - safePadding * 2);
  const paddedHeight = Math.max(24, height - safePadding * 2);

  let chosenZoom = STATIC_MAP_MIN_ZOOM;
  for (let z = STATIC_MAP_MAX_ZOOM; z >= STATIC_MAP_MIN_ZOOM; z -= 1) {
    const worldPx = STATIC_MAP_TILE_SIZE * Math.pow(2, z);
    const spanPxX = spanXNorm * worldPx;
    const spanPxY = spanYNorm * worldPx;
    if (spanPxX <= paddedWidth && spanPxY <= paddedHeight) {
      chosenZoom = z;
      break;
    }
  }

  const worldPx = STATIC_MAP_TILE_SIZE * Math.pow(2, chosenZoom);
  const centerXNorm = (minXNorm + maxXNorm) / 2;
  const centerYNorm = (minYNorm + maxYNorm) / 2;
  const originPxX = centerXNorm * worldPx - width / 2;
  const originPxY = centerYNorm * worldPx - height / 2;

  const { tiles, usesCarto } = buildTileGrid(
    chosenZoom,
    originPxX,
    originPxY,
    width,
    height,
    theme,
    cartoApiKey
  );

  const projectedSegments = normalizedSegments
    .map((segment) =>
      segment.map((norm) => ({
        x: norm.x * worldPx - originPxX,
        y: norm.y * worldPx - originPxY,
      }))
    )
    .filter((segment) => segment.length >= 2);

  const flatProjected = projectedSegments.flat();
  const startPoint = flatProjected.length > 0 ? flatProjected[0] : null;
  const endPoint =
    flatProjected.length > 1 ? flatProjected[flatProjected.length - 1] : null;

  return {
    zoom: chosenZoom,
    width,
    height,
    tiles,
    segments: projectedSegments,
    startPoint,
    endPoint,
    attribution: usesCarto ? '© OpenStreetMap · © CARTO' : '© OpenStreetMap',
    usesCarto,
    isSinglePoint: false,
  };
}

