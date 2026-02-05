/**
 * Named delay constants with jitter for workflow steps
 */

export type DelayConstant = 'small' | 'mid' | 'large';
export type DelayValue = number | DelayConstant;

export const DELAY_BASE: Record<DelayConstant, number> = {
  small: 500,
  mid: 1000,
  large: 5000,
};

/**
 * Resolve a delay value to milliseconds.
 * Numbers pass through unchanged. Named constants apply ±10% random jitter.
 */
export function resolveDelay(value: DelayValue): number {
  if (typeof value === 'number') {
    return value;
  }
  const base = DELAY_BASE[value];
  return Math.round(base * (0.9 + Math.random() * 0.2));
}
