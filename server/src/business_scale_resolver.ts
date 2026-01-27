/**
 * business_scale_resolver.ts
 *
 * This file is the sole authority for determining whether a business
 * is Local, Regional, or National.
 *
 * IMPORTANT:
 * - Ads data must NOT be used here.
 * - This will be powered by Google Knowledge Graph + Google Maps next.
 * - For now, it returns null so summary_builder falls back safely.
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
  // STEP 2 STUB
  // Identity-based logic will be added here next.
  return null;
}
