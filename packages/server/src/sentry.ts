/**
 * Sentry initialization — must be imported before all other modules in cli.ts
 */

import * as Sentry from '@sentry/node';

const FALLBACK_DSN =
  'https://2059e51d6b7a1341998b5e9ffe572c30@o4511076110499840.ingest.de.sentry.io/4511076148117584';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? FALLBACK_DSN,
  release: process.env.SENTRY_RELEASE || undefined,
  environment: process.env.NODE_ENV || 'production',
  sendDefaultPii: true,
  // Disable OpenTelemetry auto-instrumentation — it patches Node's http module
  // and destroys the underlying socket after WebSocket upgrades, breaking
  // @fastify/websocket connections (instant 1006 close on every connect).
  skipOpenTelemetrySetup: true,
});

export { Sentry };
