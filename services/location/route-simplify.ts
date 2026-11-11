import { GPSCoordinate } from '@/types/workout';

interface ProjectedPoint {
  x: number;
  y: number;
  point: GPSCoordinate;
}

/**
 * Mengelompokkan koordinat GPS secara berurutan berdasarkan segmentIndex
 * agar garis rute terputus bersih di jeda pause/resume.
 */
export function splitCoordinatesBySegment(
  points: GPSCoordinate[]
): GPSCoordinate[][] {
  if (!points || points.length === 0) return [];

  const segments: GPSCoordinate[][] = [];
  let activeSegIndex: number | null = null;

  for (const pt of points) {
    const segIdx = pt.segmentIndex ?? 0;
    if (activeSegIndex === null || segIdx !== activeSegIndex) {
      segments.push([pt]);
      activeSegIndex = segIdx;
    } else {
      segments[segments.length - 1].push(pt);
    }
  }

  return segments;
}

function perpendicularDistance(
  pt: ProjectedPoint,
  lineStart: ProjectedPoint,
  lineEnd: ProjectedPoint
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const magSq = dx * dx + dy * dy;

  if (magSq < 1e-18) {
    const px = pt.x - lineStart.x;
    const py = pt.y - lineStart.y;
    return Math.sqrt(px * px + py * py);
  }

  const numerator = Math.abs(
    dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  );
  return numerator / Math.sqrt(magSq);
}

/**
 * Implementasi iteratif (stack-based) algoritma Ramer-Douglas-Peucker pada satu segmen.
 * Selalu mempertahankan titik awal dan akhir segmen agar tikungan serta batas jeda tetap akurat.
 */
export function simplifySegmentDouglasPeucker(
  segment: GPSCoordinate[],
  epsilon: number,
  cosLat: number
): GPSCoordinate[] {
  const len = segment.length;
  if (len <= 2 || epsilon <= 0) {
    return segment;
  }

  const projected: ProjectedPoint[] = segment.map((point) => ({
    x: point.longitude * cosLat,
    y: -point.latitude,
    point,
  }));

  const keep = new Uint8Array(len);
  keep[0] = 1;
  keep[len - 1] = 1;

  const stack: [number, number][] = [[0, len - 1]];

  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) break;
    const [startIdx, endIdx] = range;
    if (endIdx - startIdx <= 1) continue;

    let maxDist = -1;
    let splitIdx = -1;
    const startPt = projected[startIdx];
    const endPt = projected[endIdx];

    for (let i = startIdx + 1; i < endIdx; i++) {
      const dist = perpendicularDistance(projected[i], startPt, endPt);
      if (dist > maxDist) {
        maxDist = dist;
        splitIdx = i;
      }
    }

    if (splitIdx !== -1 && maxDist > epsilon) {
      keep[splitIdx] = 1;
      if (splitIdx - startIdx > 1) stack.push([startIdx, splitIdx]);
      if (endIdx - splitIdx > 1) stack.push([splitIdx, endIdx]);
    }
  }

  const result: GPSCoordinate[] = [];
  for (let i = 0; i < len; i++) {
    if (keep[i] === 1) {
      result.push(segment[i]);
    }
  }
  return result;
}

/**
 * Menyederhanakan seluruh koordinat rute per segmen menggunakan Douglas-Peucker adaptif
 * hingga total titik tidak melebihi batas anggaran maxPoints.
 */
export function simplifyRouteForSilhouette(
  points: GPSCoordinate[],
  maxPoints: number = 350
): GPSCoordinate[][] {
  const segments = splitCoordinatesBySegment(points);
  if (segments.length === 0) return [];

  if (points.length <= maxPoints || maxPoints <= 2) {
    return segments;
  }

  const avgLat = points.reduce((sum, pt) => sum + pt.latitude, 0) / points.length;
  const cosLat = Math.max(0.1, Math.cos((avgLat * Math.PI) / 180));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    const x = pt.longitude * cosLat;
    const y = -pt.latitude;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const diag = Math.hypot(maxX - minX, maxY - minY);
  if (!Number.isFinite(diag) || diag < 1e-9) {
    return segments.map((seg) => (seg.length <= 2 ? seg : [seg[0], seg[seg.length - 1]]));
  }

  const applyEpsilon = (eps: number) =>
    segments.map((seg) => simplifySegmentDouglasPeucker(seg, eps, cosLat));

  const countPoints = (segs: GPSCoordinate[][]) =>
    segs.reduce((total, seg) => total + seg.length, 0);

  let low = 0;
  let high = diag;
  let bestSegments = applyEpsilon(diag);

  for (let iter = 0; iter < 20; iter++) {
    const mid = (low + high) / 2;
    const candidate = applyEpsilon(mid);
    if (countPoints(candidate) <= maxPoints) {
      bestSegments = candidate;
      high = mid;
    } else {
      low = mid;
    }
  }

  // Fallback jika terdapat terlalu banyak segmen terpisah sehingga total endpoint melebihi maxPoints
  if (countPoints(bestSegments) > maxPoints) {
    const merged: GPSCoordinate[][] = [];
    let running = 0;
    for (const seg of bestSegments) {
      if (running >= maxPoints) break;
      const room = maxPoints - running;
      if (seg.length <= room) {
        merged.push(seg);
        running += seg.length;
      } else if (room >= 2) {
        merged.push([seg[0], seg[seg.length - 1]]);
        running += 2;
      } else {
        break;
      }
    }
    return merged;
  }

  return bestSegments;
}

