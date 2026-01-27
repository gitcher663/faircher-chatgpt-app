/**
 * summary_builder.ts
 * ------------------
 * Snapshot-level seller summary builder.
 *
 * IMPORTANT:
 * - This file intentionally does NOT expose creative data.
 * - Creative execution lives in faircher_creative_ads_insights.
 */

export type AdsSummary = {
  domain: string;

  advertising_activity_snapshot: {
    status: "Active" | "Inactive" | "Inactive (Historical Buyer)";
    confidence_level: "Low" | "Medium" | "High";
    analysis_window_days: number;
    region: string;
    total_ads_detected: number;
  };

  advertising_behavior_profile: {
    advertising_intensity: "Low" | "Moderate" | "High";
    strategy_orientation: "Performance-driven" | "Brand-led" | "Mixed";
    campaign_continuity: "Short-term" | "Long-running";
    format_sophistication: "Low" | "Moderate" | "High";
    experimentation_level: "Limited" | "Moderate" | "Aggressive";
  };

  activity_timeline: {
    first_observed: string | null;
    most_recent_activity: string | null;
    ad_longevity_days: number | null;
    always_on_presence: "Yes" | "No";
  };

  ad_format_mix: Array<{
    format: "Search Ads" | "Display Ads" | "Video Ads" | "Other Ads";
    count: number;
    share: number;
  }>;

  campaign_stability_signals: {
    average_ad_lifespan_days: number | null;
    creative_rotation: "Low" | "Moderate" | "High";
    burst_activity_detected: "Yes" | "No";
    volatility_index: "Low" | "Medium" | "High";
  };

  market_investment_tier: {
    tier: "$" | "$$" | "$$$";
    description: string;
    confidence: "Low" | "Medium" | "High";
  };

  sales_interpretation: {
    summary: string;
    sell_with_opportunity: string;
    sell_against_opportunity: string;
    outreach_recommendation: string;
  };

  data_scope: {
    geography: string;
    lookback_window_days: number;
    source: string;
    disclaimer: string;
  };
};

/**
 * buildSellerSummary
 * ------------------
 * Converts analyzed ads into a seller-facing snapshot summary.
 *
 * NOTE:
 * - The analysis engine already produces the correct shape.
 * - This function exists to formalize the contract and
 *   protect tool.ts from internal refactors.
 */
export function buildSellerSummary(analysis: AdsSummary): AdsSummary {
  return analysis;
}
