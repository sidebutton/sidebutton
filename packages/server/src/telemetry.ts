/**
 * Telemetry opt-out policy.
 *
 * Kept free of side effects so it can be unit-tested; sentry.ts applies it.
 *
 * SideButton reports crashes to a built-in Sentry project. That is defensible
 * for an interactive install a person chose to run, and not defensible where
 * nobody consented on the machine's behalf — container images, CI runners, and
 * environments that set the DO_NOT_TRACK standard. Those default to silent.
 */

const OFF_VALUES = new Set(['0', 'false', 'off', 'no']);

/** Env flag semantics: present and not an explicit "off" value means on. */
function isOn(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return false;
  return !OFF_VALUES.has(normalized);
}

function isSet(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}

/**
 * Whether the built-in crash-reporting DSN may be used.
 *
 * `SIDEBUTTON_TELEMETRY` is checked first in both directions, so an operator
 * can turn reporting back on inside a container or CI job.
 */
export function isTelemetryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isSet(env.SIDEBUTTON_TELEMETRY)) return isOn(env.SIDEBUTTON_TELEMETRY);
  if (isOn(env.DO_NOT_TRACK)) return false;
  if (isOn(env.CI)) return false;
  if (isOn(env.SIDEBUTTON_CONTAINER)) return false;
  return true;
}

/**
 * The DSN to initialise with, or undefined to stay silent.
 *
 * An explicitly configured `SENTRY_DSN` always wins: that is an operator
 * pointing crash reports at their own project, which the opt-outs above —
 * all of which exist to protect people from *our* project — should not veto.
 */
export function resolveSentryDsn(
  fallbackDsn: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (isSet(env.SENTRY_DSN)) return env.SENTRY_DSN!.trim();
  return isTelemetryEnabled(env) ? fallbackDsn : undefined;
}

/**
 * Whether Sentry may attach personally identifying data (IP addresses, request
 * headers, cookies).
 *
 * Only when the operator configured the destination themselves, or asked for it
 * explicitly. Sending PII from a locally-run developer tool to the vendor's
 * project by default is what a catalog security review flags — correctly.
 */
export function shouldSendPii(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isSet(env.SENTRY_SEND_PII)) return isOn(env.SENTRY_SEND_PII);
  return isSet(env.SENTRY_DSN);
}
