/**
 * Shared LLM pricing — used by the local server/dashboard where there is no
 * portal DB. The portal keeps its own historical-pricing table in
 * `website/src/lib/pricing.ts`; this module exists so the dashboard can still
 * show a cost figure without round-tripping to the portal.
 *
 * Keep `DEFAULT_MODEL_PRICES` in sync with the seed in
 * `website/scripts/seed.ts`.
 */

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_create_tokens?: number;
}

export interface ModelPrice {
  input_per_1m_usd: number;
  output_per_1m_usd: number;
  cache_read_per_1m_usd?: number;
  cache_create_per_1m_usd?: number;
}

export const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-opus-4-7':   { input_per_1m_usd: 15,   output_per_1m_usd: 75, cache_read_per_1m_usd: 1.5,   cache_create_per_1m_usd: 18.75 },
  'claude-sonnet-4-6': { input_per_1m_usd: 3,    output_per_1m_usd: 15, cache_read_per_1m_usd: 0.3,   cache_create_per_1m_usd: 3.75  },
  'claude-haiku-4-5':  { input_per_1m_usd: 1,    output_per_1m_usd: 5,  cache_read_per_1m_usd: 0.1,   cache_create_per_1m_usd: 1.25  },
  'gpt-5.4':           { input_per_1m_usd: 1.25, output_per_1m_usd: 10, cache_read_per_1m_usd: 0.125, cache_create_per_1m_usd: 0     },
  'gpt-5.4-mini':      { input_per_1m_usd: 0.25, output_per_1m_usd: 2,  cache_read_per_1m_usd: 0.025, cache_create_per_1m_usd: 0     },
};

export function computeCost(usage: Usage, price: ModelPrice): number {
  const perM = 1_000_000;
  return (
    (usage.input_tokens * price.input_per_1m_usd) / perM +
    (usage.output_tokens * price.output_per_1m_usd) / perM +
    ((usage.cache_read_tokens ?? 0) * (price.cache_read_per_1m_usd ?? 0)) / perM +
    ((usage.cache_create_tokens ?? 0) * (price.cache_create_per_1m_usd ?? 0)) / perM
  );
}

export function lookupDefaultPrice(modelId: string): ModelPrice | null {
  return DEFAULT_MODEL_PRICES[modelId] ?? null;
}

/**
 * Per-workflow LLM usage accumulator (mirrors `ExecutionContext.llmUsage`).
 */
export interface AccumulatedUsage extends Usage {
  turns: number;
  model: string;
}

/**
 * Build the run-log `llm_usage` block for a finished workflow.
 * Returns `undefined` when no LLM call was made, so run logs from non-LLM
 * workflows stay free of empty usage fields.
 */
export function buildRunLogUsage(usage: AccumulatedUsage): {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  turns: number;
  model: string;
  cost_usd: number;
} | undefined {
  if (usage.turns === 0) return undefined;
  const price = lookupDefaultPrice(usage.model);
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_tokens ?? 0,
    cache_create_tokens: usage.cache_create_tokens ?? 0,
    turns: usage.turns,
    model: usage.model,
    cost_usd: price ? computeCost(usage, price) : 0,
  };
}
