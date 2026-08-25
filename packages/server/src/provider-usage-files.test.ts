/**
 * Every connector's `usageFile` must be a real file in `defaults/targets/` (SCRUM-1955).
 *
 * The target sync copies `defaults/targets/<usageFile>` into the config dir when a connector goes
 * active (server.ts) and SKIPS SILENTLY when the source is missing — so a typo, or a connector id
 * that drifts from its doc filename, costs the agent its connector documentation with no error
 * anywhere. The catalogue lives in @sidebutton/core and the docs live here, so this cross-package
 * pairing has no other guard.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_DEFINITIONS } from '@sidebutton/core';

const targetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../defaults/targets');

describe('connector usage files ship in defaults/targets', () => {
  it('every advertised usageFile exists on disk', () => {
    const missing: string[] = [];
    for (const def of PROVIDER_DEFINITIONS) {
      for (const conn of def.connectors) {
        if (!fs.existsSync(path.join(targetsDir, conn.usageFile))) {
          missing.push(`${def.id}/${conn.id}: ${conn.usageFile}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('each usage file declares the provider it documents in its frontmatter', () => {
    const mismatched: string[] = [];
    for (const def of PROVIDER_DEFINITIONS) {
      for (const conn of def.connectors) {
        const body = fs.readFileSync(path.join(targetsDir, conn.usageFile), 'utf8');
        if (!new RegExp(`^provider:\\s*${def.id}\\s*$`, 'm').test(body)) {
          mismatched.push(`${conn.usageFile} does not declare provider: ${def.id}`);
        }
      }
    }
    expect(mismatched).toEqual([]);
  });
});
