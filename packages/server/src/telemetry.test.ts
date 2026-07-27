import { describe, it, expect } from 'vitest';
import { isTelemetryEnabled, resolveSentryDsn, shouldSendPii } from './telemetry.js';

const DSN = 'https://public@example.ingest.sentry.io/1';

describe('isTelemetryEnabled', () => {
  it('defaults to on for a plain interactive install', () => {
    expect(isTelemetryEnabled({})).toBe(true);
  });

  it.each(['DO_NOT_TRACK', 'CI', 'SIDEBUTTON_CONTAINER'])('is off when %s is set', key => {
    expect(isTelemetryEnabled({ [key]: '1' })).toBe(false);
  });

  it('ignores opt-out flags that are explicitly off', () => {
    expect(isTelemetryEnabled({ DO_NOT_TRACK: '0', CI: 'false' })).toBe(true);
  });

  it('lets SIDEBUTTON_TELEMETRY win in both directions', () => {
    expect(isTelemetryEnabled({ SIDEBUTTON_TELEMETRY: '1', SIDEBUTTON_CONTAINER: '1' })).toBe(true);
    expect(isTelemetryEnabled({ SIDEBUTTON_TELEMETRY: 'off' })).toBe(false);
  });

  it('treats empty strings as unset, not as an opt-out', () => {
    expect(isTelemetryEnabled({ SIDEBUTTON_TELEMETRY: '', CI: '' })).toBe(true);
  });
});

describe('resolveSentryDsn', () => {
  it('uses the built-in DSN when telemetry is allowed', () => {
    expect(resolveSentryDsn(DSN, {})).toBe(DSN);
  });

  it('stays silent in a container — the catalog image sets SIDEBUTTON_CONTAINER', () => {
    expect(resolveSentryDsn(DSN, { SIDEBUTTON_CONTAINER: '1' })).toBeUndefined();
  });

  it('honours an operator-configured DSN even inside a container', () => {
    const own = 'https://public@self.hosted/42';
    expect(resolveSentryDsn(DSN, { SENTRY_DSN: own, SIDEBUTTON_CONTAINER: '1' })).toBe(own);
  });
});

describe('shouldSendPii', () => {
  it('never sends PII to the built-in project by default', () => {
    expect(shouldSendPii({})).toBe(false);
  });

  it('sends PII when the operator points at their own Sentry project', () => {
    expect(shouldSendPii({ SENTRY_DSN: DSN })).toBe(true);
  });

  it('can be forced either way', () => {
    expect(shouldSendPii({ SENTRY_SEND_PII: '1' })).toBe(true);
    expect(shouldSendPii({ SENTRY_DSN: DSN, SENTRY_SEND_PII: 'false' })).toBe(false);
  });
});
