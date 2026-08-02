import { describe, it, expect } from 'vitest';
import { newRunId } from './run-id.js';

// The bug this guards (sidebutton/sidebutton#2): the old scheme sliced the ISO timestamp to 15
// characters, which stops at the minute, so two runs of one workflow in the same minute collided
// and the second overwrote the first's `<runId>.json` log.

describe('newRunId', () => {
  it('keeps the workflow id readable as the prefix', () => {
    const id = newRunId('linkedin_accept_all_invitations', new Date('2026-01-31T17:30:45.678Z'));
    expect(id.startsWith('linkedin_accept_all_invitations_')).toBe(true);
  });

  it('carries the timestamp through milliseconds', () => {
    const id = newRunId('hello_world', new Date('2026-01-31T17:30:45.678Z'));
    // workflow id + `_YYYYMMDDTHHMMSSmmm_` + hex suffix.
    expect(id).toMatch(/^hello_world_20260131T173045678_[0-9a-f]{6}$/);
  });

  it('keeps millisecond digits that look droppable', () => {
    // `.000Z` and `.010Z` are where a timestamp built by trimming rather than by matching tends to
    // lose a digit and quietly shorten the ID.
    expect(newRunId('w', new Date('2026-01-31T17:30:45.000Z'))).toMatch(/^w_20260131T173045000_/);
    expect(newRunId('w', new Date('2026-01-31T17:30:45.010Z'))).toMatch(/^w_20260131T173045010_/);
  });

  it('separates runs one millisecond apart', () => {
    const a = newRunId('w', new Date('2026-01-31T17:30:45.678Z'));
    const b = newRunId('w', new Date('2026-01-31T17:30:45.679Z'));
    expect(a).not.toBe(b);
  });

  it('separates runs within the same minute — the original collision', () => {
    const a = newRunId('w', new Date('2026-01-31T17:30:01.000Z'));
    const b = newRunId('w', new Date('2026-01-31T17:30:59.000Z'));
    expect(a).not.toBe(b);
  });

  it('separates runs that start in the same millisecond', () => {
    // Reachable under concurrent dispatch, where the clock alone cannot separate two runs.
    const sameTick = new Date('2026-01-31T17:30:45.678Z');
    const ids = new Set(Array.from({ length: 200 }, () => newRunId('w', sameTick)));
    // 200 draws from 24 bits: the expected number of collisions is ~0.001, so anything short of
    // near-perfect means the suffix is not carrying its entropy. The small margin keeps the test
    // from being the one-in-a-billion flake.
    expect(ids.size).toBeGreaterThan(195);
  });

  it('sorts lexically by start time, so run logs list in order', () => {
    const earlier = newRunId('w', new Date('2026-01-31T17:30:45.678Z'));
    const later = newRunId('w', new Date('2026-02-01T09:00:00.000Z'));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it('stays a safe filename — it is used as `<runId>.json`', () => {
    const id = newRunId('hello_world', new Date('2026-01-31T17:30:45.678Z'));
    expect(id).not.toMatch(/[:.\\/]/);
  });
});
