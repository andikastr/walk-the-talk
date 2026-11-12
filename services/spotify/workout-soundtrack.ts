import type { WorkoutRecord, WorkoutSoundtrackItem } from '@/types/workout';

export interface MinimalSpotifyTrack {
  id?: string | null;
  name?: string | null;
  artists?: { name?: string | null }[] | null;
}

function normalizeText(value?: string | null): string {
  return (value ?? '').trim();
}

function buildTextKey(trackName: string, artist: string): string {
  return `${trackName.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
}

function isSameTrack(a: WorkoutSoundtrackItem, b: WorkoutSoundtrackItem): boolean {
  if (a.trackId && b.trackId && a.trackId === b.trackId) {
    return true;
  }
  return buildTextKey(a.trackName, a.artist) === buildTextKey(b.trackName, b.artist);
}

/**
 * Converts a Spotify track payload into a clean {@link WorkoutSoundtrackItem}.
 * Returns null when the track has no usable title.
 */
export function toWorkoutSoundtrackItem(
  track: MinimalSpotifyTrack | null | undefined,
  playedAt?: number,
): WorkoutSoundtrackItem | null {
  const trackName = normalizeText(track?.name);
  if (!trackName) return null;

  const artistNames = (track?.artists ?? [])
    .map((artist) => normalizeText(artist?.name))
    .filter(Boolean);
  const artist = artistNames.length > 0 ? artistNames.join(', ') : 'Unknown';
  const trackId = normalizeText(track?.id) || undefined;
  const validPlayedAt =
    typeof playedAt === 'number' && Number.isFinite(playedAt) ? playedAt : undefined;

  return {
    ...(trackId ? { trackId } : {}),
    trackName,
    artist,
    ...(validPlayedAt !== undefined ? { playedAt: validPlayedAt } : {}),
  };
}

/**
 * Appends a soundtrack entry if it has not been recorded yet in the session.
 * Preserves first-played ordering while enriching missing trackId/timestamp metadata.
 */
export function appendUniqueSoundtrack(
  list: WorkoutSoundtrackItem[],
  candidate: WorkoutSoundtrackItem | null | undefined,
): WorkoutSoundtrackItem[] {
  if (!candidate) return list;

  const trackName = normalizeText(candidate.trackName);
  if (!trackName) return list;

  const normalizedCandidate: WorkoutSoundtrackItem = {
    ...(normalizeText(candidate.trackId) ? { trackId: normalizeText(candidate.trackId) } : {}),
    trackName,
    artist: normalizeText(candidate.artist) || 'Unknown',
    ...(typeof candidate.playedAt === 'number' && Number.isFinite(candidate.playedAt)
      ? { playedAt: candidate.playedAt }
      : {}),
  };

  const existingIndex = list.findIndex((item) => isSameTrack(item, normalizedCandidate));
  if (existingIndex === -1) {
    return [...list, normalizedCandidate];
  }

  const existing = list[existingIndex];
  const mergedPlayedAt =
    existing.playedAt !== undefined && normalizedCandidate.playedAt !== undefined
      ? Math.min(existing.playedAt, normalizedCandidate.playedAt)
      : (existing.playedAt ?? normalizedCandidate.playedAt);
  const mergedTrackId = existing.trackId ?? normalizedCandidate.trackId;

  if (mergedPlayedAt === existing.playedAt && mergedTrackId === existing.trackId) {
    return list;
  }

  const next = list.slice();
  next[existingIndex] = {
    ...existing,
    ...(mergedTrackId ? { trackId: mergedTrackId } : {}),
    ...(mergedPlayedAt !== undefined ? { playedAt: mergedPlayedAt } : {}),
  };
  return next;
}

/**
 * Combines live session captures and Spotify recently-played tracks into a single
 * deduplicated playlist ordered chronologically by first play.
 */
export function mergeWorkoutSoundtracks(
  recorded: WorkoutSoundtrackItem[],
  recentlyPlayed: WorkoutSoundtrackItem[] = [],
  window?: { startMs?: number; endMs?: number },
): WorkoutSoundtrackItem[] {
  let merged: WorkoutSoundtrackItem[] = [];

  for (const item of recorded) {
    merged = appendUniqueSoundtrack(merged, item);
  }

  const startMs = window?.startMs;
  const endMs = window?.endMs;

  for (const item of recentlyPlayed) {
    if (
      item.playedAt !== undefined &&
      startMs !== undefined &&
      item.playedAt < startMs - 2000
    ) {
      continue;
    }
    if (
      item.playedAt !== undefined &&
      endMs !== undefined &&
      item.playedAt > endMs + 10000
    ) {
      continue;
    }
    merged = appendUniqueSoundtrack(merged, item);
  }

  return merged
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aTime = a.item.playedAt ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.item.playedAt ?? Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/**
 * Resolves the full playlist array for any workout record or summary, falling back
 * gracefully to legacy single-track columns (`soundtrackTrackName` / `soundtrackArtist`).
 */
export function normalizeWorkoutSoundtracks(
  record?: Pick<
    WorkoutRecord,
    'soundtracks' | 'soundtrackTrackName' | 'soundtrackArtist'
  > | null,
): WorkoutSoundtrackItem[] {
  if (!record) return [];

  let normalized: WorkoutSoundtrackItem[] = [];
  if (Array.isArray(record.soundtracks) && record.soundtracks.length > 0) {
    for (const item of record.soundtracks) {
      normalized = appendUniqueSoundtrack(normalized, item);
    }
  }

  if (normalized.length > 0) {
    return normalized;
  }

  const legacyName = normalizeText(record.soundtrackTrackName);
  if (!legacyName) return [];

  return [
    {
      trackName: legacyName,
      artist: normalizeText(record.soundtrackArtist) || 'Unknown',
    },
  ];
}

export function getPrimarySoundtrack(
  soundtracks: WorkoutSoundtrackItem[],
): { trackName: string; artist: string } | undefined {
  if (soundtracks.length === 0) return undefined;
  return {
    trackName: soundtracks[0].trackName,
    artist: soundtracks[0].artist,
  };
}

