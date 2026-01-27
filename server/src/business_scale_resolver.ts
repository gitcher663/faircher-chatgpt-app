/**
 * business_scale_resolver.ts
 *
 * This file is the sole authority for determining whether a business
 * is Local, Regional, or National.
 *
 * IMPORTANT:
 * - Ads data MUST NOT be used here.
 * - This will be powered by Google Knowledge Graph + identity signals.
 * - For now, it returns null so callers can fall back safely.
 */

export type BusinessScale =
  | {
      scale_classification: "Local" | "Regional" | "National";
      geographic_focus: "Single-market" | "Multi-market" | "Nationwide";
      buying_complexity: "Simple" | "Moderate" | "Advanced";
      source: "Identity";
    }
  | null;

export async function resolveBusinessScale(input: {
  domain?: string;
  brandName?: string;
}): Promise<BusinessScale> {
  /**
   * STEP 2 (future):
   * - Google Knowledge Graph entity lookup
   * - Wikipedia / organization signals
   * - Corporate footprint analysis
   */

  // STEP 1: Stub — identity resolution not wired yet
  return null;
}
