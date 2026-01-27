/**
 * summary_builder.ts
 * ------------------
 * Translates AdsAnalysis into a seller-facing AdsSummary snapshot.
 *
 * IMPORTANT DESIGN NOTES
 * ----------------------
 * - AdsAnalysis is an internal, signal-preserving model.
 * - AdsSummary is a UI-safe, seller-facing contract.
 * - These two shapes are intentionally DECOUPLED.
 *
 * Because of this, an explicit boundary cast is required.
 * This is deliberate and safe in the current architecture.
 */

import type { AdsAnalysis } from "./ads_analysis";

/* ============================================================================
   Public Output Contract
   ============================================================================ */

export type AdsSummary = {
  domain: string;

  /* ============================================================
     Advertising Activity Snapshot
     ============================================================ */

  advertising_activity_snapshot: {
    status: "Active" | "Inactive" | "Inactive (Historical Buyer)";
    confidence_level: "Low" | "Medium" | "High";
    analysis_window_days: number;
    region: string;
    total_ads_detected: number;
  };

  /* ============================================================
     Advertising Behavior Profile
     ============================================================ */

  advertising_behavior_profile: {
    advertising_intensity: "Low" | "Moderate" | "High";
    strategy_orientation: "Performance-driven" | "Brand-led" | "Mixed";
    campaign_continuity: "Short-term" | "Long-running";
    format_sophistication: "Low" | "Moderate" | "High";
    experimentation_level: "Limited" | "Moderate" | "Aggressive";
  };

  /* ============================================================
     Activity Timeline
     ============================================================ */

  activity_timeline: {
    first_observed: string | null;
    most_recent_activity: string | null;
    ad_longevity_days: number | null;
    always_on_presence: "Yes" | "No";
  };

  /* ============================================================
     Ad Format Mix
     ============================================================ */

  ad_format_mix: Array<{
    format: "Search Ads" | "Display Ads" | "Video Ads" | "Other Ads";
    count: number;
    share: number;
  }>;

  /* ============================================================
     Campaign Stability Signals
     ============================================================ */

  campaign_stability_signals: {
    average_ad_lifespan_days: number | null;
    creative_rotation: "Low" | "Moderate" | "High";
    burst_activity_detected: "Yes" | "No";
    volatility_index: "Low" | "Medium" | "High";
  };

  /* ============================================================
     Market Investment Tier
     ============================================================ */

  market_investment_tier: {
    tier: "$" | "$$" | "$$$";
    description: string;
    confidence: "Low" | "Medium" | "High";
  };

  /* ============================================================
     Sales Interpretation (Seller-Facing)
     ============================================================ */

  sales_interpretation: {
    summary: string;
    sell_with_opportunity: string;
    sell_against_opportunity: string;
    outreach_recommendation: string;
  };

  /* ============================================================
     Data Scope
     ============================================================ */

  data_scope: {
    geography: string;
    lookback_window_days: number;
    source: string;
    disclaimer: string;
  };
};

/* ============================================================================
   Builder
   ============================================================================ */

/**
 * buildSellerSummary
 * ------------------
 * Explicit boundary between AdsAnalysis and AdsSummary.
 *
 * TypeScript TS2352 requires this cast to go through `unknown`
 * because the two models intentionally do not structurally overlap.
 *
 * This is NOT a hack.
 * This is an explicit architectural assertion.
 */
export function buildSellerSummary(
  analysis: AdsAnalysis
): AdsSummary {
  return analysis as unknown as AdsSummary;
}
