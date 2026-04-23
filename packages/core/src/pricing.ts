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

/**
 * Find the best-matching bundled price for a model id. Falls back to a
 * prefix match so dated slugs like `claude-opus-4-7-20260315` still resolve.
 */
export function lookupDefaultPrice(modelId: string): ModelPrice | null {
  if (!modelId) return null;
  const exact = DEFAULT_MODEL_PRICES[modelId];
  if (exact) return exact;
  for (const [key, price] of Object.entries(DEFAULT_MODEL_PRICES)) {
    if (modelId.startsWith(key)) return price;
  }
  return null;
}
