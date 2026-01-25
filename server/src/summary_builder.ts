import { differenceInDays, parseISO } from "date-fns";
import type { AdsAnalysis, CanonicalAdFormat } from "./ads_analysis";
import { ANALYSIS_WINDOW } from "./ads_analysis";

/* ============================================================================
   Types
   ============================================================================ */

export type FormatSpecificSummary = {
  format: CanonicalAdFormat;
  analysis_window_days: number;
  region: string;
  total_ads_detected: number;
  share_of_total_activity: number;
  activity_pattern: "Always-on" | "Seasonal" | "Burst-driven";
  sales_signal_strength: "Weak" | "Moderate" | "Strong";
};

export type SellerSummary = {
  domain: string;

  advertising_activity_snapshot: {
    status: "Active" | "Inactive" | "Inactive (Historical Buyer)";
    confidence_level: "Low" | "Medium" | "High";
    analysis_window_days: number;
    region: string;
    sales_signal_strength: "Weak" | "Moderate" | "Strong";
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
    format: CanonicalAdFormat;
    count: number;
    share: number;
  }>;

  campaign_stability_signals: {
    average_ad_lifespan_days: number | null;
    creative_rotation: "Low" | "Moderate" | "High";
    burst_activity_detected: "Yes" | "No";
    volatility_index: "Low" | "Medium" | "High";
  };

  advertiser_scale: {
    scale_classification: "Local" | "Regional" | "National";
    geographic_focus: "Single-market" | "Multi-market" | "Nationwide";
    buying_complexity: "Simple" | "Moderate" | "Advanced";
  };

  estimated_media_spend: {
    spend_level: "$" | "$$" | "$$$" | "$$$$";
    confidence: "Low" | "Medium" | "High";
  };

  spend_adequacy: {
    relative_investment_level:
      | "Underinvested"
      | "Appropriately Invested"
      | "Overextended";
    consistency_vs_scale: "Low" | "Moderate" | "High";
    growth_headroom: "Limited" | "Moderate" | "Significant";
  };

  spend_posture: {
    commitment_level: "Experimental" | "Sustained" | "Aggressive";
    scaling_pattern: "Flat" | "Seasonal" | "Accelerating";
    risk_profile: "Conservative" | "Balanced" | "Aggressive";
  };

  sales_interpretation: {
    sell_with_opportunity: string;
    sell_against_opportunity: string;
    outreach_recommendation: string;
  };

  data_scope: {
    geography: string;
    lookback_window_days: number;
    source: string;
  };
};

/* ============================================================================
   Helpers
   ============================================================================ */

const percent = (count: number, total: number) =>
  total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;

const confidenceLevel = (totalAds: number) =>
  totalAds < 5 ? "Low" : totalAds < 15 ? "Medium" : "High";

const spendLevel = (totalAds: number): "$" | "$$" | "$$$" | "$$$$" =>
  totalAds < 5 ? "$" : totalAds < 15 ? "$$" : totalAds < 40 ? "$$$" : "$$$$";

const spendConfidence = (totalAds: number): "Low" | "Medium" | "High" =>
  totalAds < 5 ? "Low" : totalAds < 15 ? "Medium" : "High";

/* ============================================================================
   Builder
   ============================================================================ */

export function buildSellerSummary(analysis: AdsAnalysis): SellerSummary {
  const totalAds = analysis.total_ads;

  const status =
    totalAds === 0
      ? "Inactive"
      : analysis.last_seen_days_ago !== null && analysis.last_seen_days_ago > 30
      ? "Inactive (Historical Buyer)"
      : "Active";

  const longevity = analysis.ad_lifespan_days;

  const formatMix = Object.entries(analysis.formats)
    .filter(([, count]) => count > 0)
    .map(([format, count]) => ({
      format: format as CanonicalAdFormat,
      count,
      share: percent(count, totalAds),
    }));

  return {
    domain: analysis.domain,

    advertising_activity_snapshot: {
      status,
      confidence_level: confidenceLevel(totalAds),
      analysis_window_days: ANALYSIS_WINDOW.days,
      region: ANALYSIS_WINDOW.region,
      sales_signal_strength:
        totalAds < 5 ? "Weak" : totalAds < 20 ? "Moderate" : "Strong",
      total_ads_detected: totalAds,
    },

    advertising_behavior_profile: {
      advertising_intensity:
        totalAds < 5 ? "Low" : totalAds < 20 ? "Moderate" : "High",
      strategy_orientation:
        percent(analysis.formats["Search Ads"] ?? 0, totalAds) >= 60
          ? "Performance-driven"
          : percent(
              (analysis.formats["Display Ads"] ?? 0) +
                (analysis.formats["Video Ads"] ?? 0),
              totalAds
            ) >= 60
          ? "Brand-led"
          : "Mixed",
      campaign_continuity:
        longevity !== null && longevity >= 180 ? "Long-running" : "Short-term",
      format_sophistication:
        formatMix.length >= 3
          ? "High"
          : formatMix.length === 2
          ? "Moderate"
          : "Low",
      experimentation_level:
        totalAds < 10 ? "Limited" : totalAds < 30 ? "Moderate" : "Aggressive",
    },

    activity_timeline: {
      first_observed: analysis.first_seen,
      most_recent_activity: analysis.last_seen,
      ad_longevity_days: longevity,
      always_on_presence:
        status === "Active" && longevity !== null && longevity >= 180
          ? "Yes"
          : "No",
    },

    ad_format_mix: formatMix,

    campaign_stability_signals: {
      average_ad_lifespan_days:
        analysis.ads.length > 0
          ? Math.round(
              analysis.ads
                .map(ad =>
                  differenceInDays(
                    parseISO(ad.last_seen),
                    parseISO(ad.first_seen)
                  )
                )
                .reduce((a, b) => a + b, 0) / analysis.ads.length
            )
          : null,
      creative_rotation:
        totalAds >= 30 ? "High" : totalAds >= 10 ? "Moderate" : "Low",
      burst_activity_detected:
        longevity !== null && longevity < 60 && totalAds >= 5 ? "Yes" : "No",
      volatility_index:
        status !== "Active"
          ? "Medium"
          : longevity !== null && longevity < 60
          ? "High"
          : "Low",
    },

    advertiser_scale: {
      scale_classification:
        totalAds >= 40 ? "National" : totalAds >= 15 ? "Regional" : "Local",
      geographic_focus:
        totalAds >= 40
          ? "Nationwide"
          : totalAds >= 15
          ? "Multi-market"
          : "Single-market",
      buying_complexity:
        formatMix.length >= 3
          ? "Advanced"
          : formatMix.length === 2
          ? "Moderate"
          : "Simple",
    },

    estimated_media_spend: {
      spend_level: spendLevel(totalAds),
      confidence: spendConfidence(totalAds),
    },

    spend_adequacy: {
      relative_investment_level:
        totalAds < 10
          ? "Underinvested"
          : totalAds >= 40
          ? "Overextended"
          : "Appropriately Invested",
      consistency_vs_scale:
        status === "Active" && longevity !== null && longevity >= 180
          ? "High"
          : totalAds >= 5
          ? "Moderate"
          : "Low",
      growth_headroom:
        totalAds < 10
          ? "Significant"
          : totalAds >= 40
          ? "Limited"
          : "Moderate",
    },

    spend_posture: {
      commitment_level:
        totalAds >= 40
          ? "Aggressive"
          : status === "Active" && longevity !== null && longevity >= 120
          ? "Sustained"
          : "Experimental",
      scaling_pattern:
        longevity !== null && longevity >= 200
          ? "Flat"
          : longevity !== null && longevity < 90
          ? "Seasonal"
          : "Accelerating",
      risk_profile:
        totalAds >= 40
          ? "Aggressive"
          : totalAds < 10
          ? "Conservative"
          : "Balanced",
    },

    sales_interpretation: {
      sell_with_opportunity: `Position as a ${spendLevel(
        totalAds
      )} advertiser with ${formatMix.length}-format coverage.`,
      sell_against_opportunity: `Exploit gaps during ${status.toLowerCase()} phases.`,
      outreach_recommendation: `Align packages to cadence, scale, and inferred spend posture.`,
    },

    data_scope: {
      geography: "United States",
      lookback_window_days: ANALYSIS_WINDOW.days,
      source: ANALYSIS_WINDOW.source,
    },
  };
}
