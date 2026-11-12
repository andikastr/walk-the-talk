import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  appendUniqueSoundtrack,
  getPrimarySoundtrack,
  mergeWorkoutSoundtracks,
  normalizeWorkoutSoundtracks,
  toWorkoutSoundtrackItem,
} from '@/services/spotify/workout-soundtrack';
import { getRecentlyPlayedTracks } from '@/services/spotify/player';
import { spotifyFetch } from '@/services/spotify/client';

jest.mock('@/services/spotify/client', () => ({
  spotifyFetch: jest.fn(),
}));

const mockedSpotifyFetch = spotifyFetch as jest.MockedFunction<typeof spotifyFetch>;

describe('services/spotify/workout-soundtrack', () => {
  beforeEach(() => {
    mockedSpotifyFetch.mockReset();
  });

  it('converts Spotify tracks and deduplicates uniquely in first-played order', () => {
    const first = toWorkoutSoundtrackItem(
      {
        id: 'trk_1',
        name: 'Morning Run',
        artists: [{ name: 'Artist One' }, { name: 'Feat Two' }],
      },
      1_000_000
    );
    const second = toWorkoutSoundtrackItem(
      {
        id: 'trk_2',
        name: 'Cadence Beat',
        artists: [{ name: 'Runner Band' }],
      },
      1_001_000
    );
    const replayFirst = toWorkoutSoundtrackItem(
      {
        id: 'trk_1',
        name: 'Morning Run',
        artists: [{ name: 'Artist One' }, { name: 'Feat Two' }],
      },
      1_002_000
    );
    const sameTextNoId = {
      trackName: '  cadence beat ',
      artist: 'runner band',
      playedAt: 1_000_500,
    };

    let list = appendUniqueSoundtrack([], first);
    list = appendUniqueSoundtrack(list, second);
    list = appendUniqueSoundtrack(list, replayFirst);
    list = appendUniqueSoundtrack(list, sameTextNoId);

    expect(list).toHaveLength(2);
    expect(list.map((t) => t.trackName)).toEqual(['Morning Run', 'Cadence Beat']);
    expect(list[0].artist).toBe('Artist One, Feat Two');
    expect(list[0].playedAt).toBe(1_000_000);
    // Earliest timestamp is preserved when enriched by a duplicate capture
    expect(list[1].playedAt).toBe(1_000_500);
    expect(getPrimarySoundtrack(list)).toEqual({
      trackName: 'Morning Run',
      artist: 'Artist One, Feat Two',
    });
  });

  it('merges live captures and recently-played tracks chronologically within workout window', () => {
    const startMs = 1_700_000_000_000;
    const endMs = startMs + 900_000;

    const liveRecorded = [
      { trackId: 't1', trackName: 'Warmup', artist: 'A', playedAt: startMs + 5_000 },
      { trackId: 't3', trackName: 'Finish Kick', artist: 'C', playedAt: endMs - 2_000 },
    ];

    const recentlyPlayed = [
      // Before workout start -> filtered out
      { trackId: 't0', trackName: 'Pre Workout', artist: 'Z', playedAt: startMs - 60_000 },
      // Background track played with screen off between t1 and t3
      { trackId: 't2', trackName: 'Locked Screen Tempo', artist: 'B', playedAt: startMs + 240_000 },
      // Same t1 completed later -> deduplicated
      { trackId: 't1', trackName: 'Warmup', artist: 'A', playedAt: startMs + 180_000 },
    ];

    const merged = mergeWorkoutSoundtracks(liveRecorded, recentlyPlayed, {
      startMs,
      endMs,
    });

    expect(merged.map((t) => t.trackId)).toEqual(['t1', 't2', 't3']);
  });

  it('falls back cleanly to legacy soundtrackTrackName and soundtrackArtist fields', () => {
    const legacy = normalizeWorkoutSoundtracks({
      soundtrackTrackName: 'Legacy Anthem',
      soundtrackArtist: 'Classic Act',
    });

    expect(legacy).toEqual([
      { trackName: 'Legacy Anthem', artist: 'Classic Act' },
    ]);
    expect(normalizeWorkoutSoundtracks({})).toEqual([]);
  });

  it('fetches recently-played chronologically and handles HTTP 403 missing scope gracefully', async () => {
    mockedSpotifyFetch.mockResolvedValueOnce({
      items: [
        {
          played_at: '2026-11-12T03:10:00.000Z',
          track: { id: 'b', name: 'Later Track', artists: [{ name: 'Artist B' }] },
        },
        {
          played_at: '2026-11-12T03:05:00.000Z',
          track: { id: 'a', name: 'Earlier Track', artists: [{ name: 'Artist A' }] },
        },
      ],
    });

    const okResult = await getRecentlyPlayedTracks({
      afterMs: 1_700_000_000_000,
      limit: 20,
    });
    expect(okResult.missingScope).toBe(false);
    expect(okResult.items.map((i) => i.trackId)).toEqual(['a', 'b']);

    const err403 = Object.assign(new Error('Insufficient client scope'), { status: 403 });
    mockedSpotifyFetch.mockRejectedValueOnce(err403);

    const scopedResult = await getRecentlyPlayedTracks({ afterMs: 1_700_000_000_000 });
    expect(scopedResult).toEqual({ items: [], missingScope: true });
  });
});

