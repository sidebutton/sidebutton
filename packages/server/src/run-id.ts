/**
 * Run ID generation (sidebutton/sidebutton#2).
 *
 * A run ID is only ever used as a run-log filename (`<runId>.json`). Nothing parses one back apart —
 * listings sort on `metadata.timestamp` from inside the JSON, not on the name — so the format is free
 * to change. What it has to guarantee is uniqueness.
 *
 * The previous scheme sliced the ISO timestamp to 15 characters, which lands mid-way through the
 * clock: `2026-01-31T1730`. That is MINUTE precision, not the second precision the format suggests,
 * so two runs of the same workflow inside the same minute produced identical IDs and the second
 * silently overwrote the first's log.
 *
 * Milliseconds plus a random suffix fixes it. The timestamp stays fixed-width and leading, so IDs
 * still sort lexically by start time; the suffix covers the same-millisecond case, which is reachable
 * whenever runs are dispatched concurrently rather than by hand.
 */

import * as crypto from 'node:crypto';

/**
 * Bytes of randomness in the suffix, rendered as hex.
 *
 * Three (24 bits) rather than the ~12 that would look tidy next to a timestamp. The suffix only has
 * to separate runs landing in the same millisecond, but that is precisely the bulk-dispatch case:
 * with 12 bits, ten same-millisecond runs of one workflow collide about 1% of the time, and a
 * collision here means the same silent log overwrite this module exists to prevent. 24 bits pushes
 * that below one in a million for three more characters.
 */
const SUFFIX_BYTES = 3;

/**
 * Build a unique run ID for a workflow.
 *
 * @param workflowId Workflow being run; becomes the ID's readable prefix.
 * @param now Injectable clock, for tests.
 */
export function newRunId(workflowId: string, now: Date = new Date()): string {
  // `2026-01-31T17:30:45.678Z` -> `20260131T173045678`, anchored to the shape of an ISO string
  // rather than cut to a character count. The bug being fixed here was exactly a slice whose
  // length had stopped matching what the replace in front of it removed.
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1');
  const suffix = crypto.randomBytes(SUFFIX_BYTES).toString('hex');
  return `${workflowId}_${timestamp}_${suffix}`;
}
