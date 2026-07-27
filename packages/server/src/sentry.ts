/**
 * Sentry initialization — must be imported before all other modules in cli.ts
 */

import * as Sentry from '@sentry/node';
import { resolveSentryDsn, shouldSendPii } from './telemetry.js';

const FALLBACK_DSN =
  'https://2059e51d6b7a1341998b5e9ffe572c30@o4511076110499840.ingest.de.sentry.io/4511076148117584';

// Undefined in containers, CI and DO_NOT_TRACK environments; Sentry.init with
// no DSN is a documented no-op, but skipping the call keeps those runs free of
// the SDK's global hooks entirely.
const dsn = resolveSentryDsn(FALLBACK_DSN);

if (dsn) {
  Sentry.init({
    dsn,
    release: process.env.SENTRY_RELEASE || undefined,
    environment: process.env.NODE_ENV || 'production',
    sendDefaultPii: shouldSendPii(),
    // Disable OpenTelemetry auto-instrumentation — it patches Node's http module
    // and destroys the underlying socket after WebSocket upgrades, breaking
    // @fastify/websocket connections (instant 1006 close on every connect).
    skipOpenTelemetrySetup: true,
  });
}

export { Sentry };
