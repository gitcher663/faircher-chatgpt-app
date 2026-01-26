import { differenceInDays, parseISO } from "date-fns";
import type { AdsAnalysis } from "./ads_analysis";
import { ANALYSIS_WINDOW } from "./ads_analysis";

/* ============================================================================
   Types
============================================================================ */

type IntensityLevel = "Low" | "Moderate" | "High";
type ConfidenceLevel = "Low" | "Medium" | "High";
type SalesSignalStrength = "Weak" | "Moderate" | "Strong";

export type AdsSummary = {
  domain: string;

  advertising_activity_snapshot: {
    status: "Active" | "Inactive" | "Inactive (Historical Buyer)";
    confidence_level: ConfidenceLevel;
    analysis_window_days: number;
    region: string;
    sales_signal_strength: SalesSignalStrength;
    total_ads_detected: number;
  };

  advertising_behavior_profile: {
    advertising_intensity: IntensityLevel;
    strategy_orientation: "Performance-driven" | "Brand-led" | "Mixed";
    campaign_continuity: "Short-term" | "Long-running";
    format_sophistication: IntensityLevel;
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

  advertiser_scale: {
    scale_classification: "Local" | "Regional" | "National";
    geographic_focus: "Single-market" | "Multi-market" | "Nationwide";
    buying_complexity: "Simple" | "Moderate" | "Advanced";
  };

  estimated_monthly_media_spend: {
    spend_tier:
      | "$500 – $10,000 / month"
      | "$10,001 – $20,000 / month"
      | "$20,001 – $100,000 / month"
      | "$100,000+ / month";
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

const confidenceFromVolume = (totalAds: number): ConfidenceLevel =>
  totalAds < 5 ? "Low" : totalAds < 15 ? "Medium" : "High";

const salesSignalFromVolume = (totalAds: number): SalesSignalStrength =>
  totalAds < 5 ? "Weak" : totalAds < 20 ? "Moderate" : "Strong";

const tierFromSignal = (
  totalAds: number,
  hasVideo: boolean
): AdsSummary["estimated_monthly_media_spend"]["spend_tier"] => {
  if (totalAds >= 25 || hasVideo) return "$20,001 – $100,000 / month";
  if (totalAds >= 10) return "$10,001 – $20,000 / month";
  return "$500 – $10,000 / month";
};

const intensityFromVolume = (totalAds: number): IntensityLevel =>
  totalAds < 5 ? "Low" : totalAds < 20 ? "Moderate" : "High";

const sophisticationFromFormats = (formats: number): IntensityLevel =>
  formats <= 1 ? "Low" : formats <= 2 ? "Moderate" : "High";

const campaignContinuityFromLifespan = (
  lifespanDays: number | null
): "Short-term" | "Long-running" =>
  lifespanDays !== null && lifespanDays >= 90 ? "Long-running" : "Short-term";

const experimentationFromMix = (
  formats: number,
  hasVideo: boolean
): "Limited" | "Moderate" | "Aggressive" => {
  if (formats >= 3 && hasVideo) return "Aggressive";
  if (formats >= 2) return "Moderate";
  return "Limited";
};

const orientationFromMix = (
  searchShare: number,
  videoShare: number
): "Performance-driven" | "Brand-led" | "Mixed" => {
  if (searchShare >= 60) return "Performance-driven";
  if (videoShare >= 40) return "Brand-led";
  return "Mixed";
};

const scaleFromVolume = (
  totalAds: number
): AdsSummary["advertiser_scale"] => {
  if (totalAds >= 30) {
    return {
      scale_classification: "National",
      geographic_focus: "Nationwide",
      buying_complexity: "Advanced",
    };
  }
  if (totalAds >= 10) {
    return {
      scale_classification: "Regional",
      geographic_focus: "Multi-market",
      buying_complexity: "Moderate",
    };
  }
  return {
    scale_classification: "Local",
    geographic_focus: "Single-market",
    buying_complexity: "Simple",
  };
};

const adequacyFromSpend = (
  spendTier: AdsSummary["estimated_monthly_media_spend"]["spend_tier"],
  intensity: IntensityLevel
): AdsSummary["spend_adequacy"] => {
  const alignment =
    spendTier === "$500 – $10,000 / month" && intensity === "High"
      ? "Underinvested"
      : spendTier === "$100,000+ / month" && intensity === "Low"
      ? "Overextended"
      : "Appropriately Invested";

  return {
    relative_investment_level: alignment,
    consistency_vs_scale:
      intensity === "High" ? "High" : intensity === "Moderate" ? "Moderate" : "Low",
    growth_headroom:
      alignment === "Underinvested"
        ? "Significant"
        : alignment === "Overextended"
        ? "Limited"
        : "Moderate",
  };
};

const postureFromSpend = (
  spendTier: AdsSummary["estimated_monthly_media_spend"]["spend_tier"],
  hasVideo: boolean
): AdsSummary["spend_posture"] => {
  if (spendTier === "$100,000+ / month") {
    return {
      commitment_level: "Aggressive",
      scaling_pattern: "Accelerating",
      risk_profile: "Aggressive",
    };
  }
  if (spendTier === "$20,001 – $100,000 / month" || hasVideo) {
    return {
      commitment_level: "Sustained",
      scaling_pattern: "Seasonal",
      risk_profile: "Balanced",
    };
  }
  return {
    commitment_level: "Experimental",
    scaling_pattern: "Flat",
    risk_profile: "Conservative",
  };
};

const averageAdLifespanDays = (ads: AdsAnalysis["ads"]): number | null => {
  if (ads.length === 0) return null;
  const lifespans = ads.map(ad => {
    const start = parseISO(ad.first_seen);
    const end = parseISO(ad.last_seen);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 0;
    }
    return Math.max(0, differenceInDays(end, start));
  });
  const total = lifespans.reduce((sum, value) => sum + value, 0);
  return Math.round(total / lifespans.length);
};

/* ============================================================================
   Builder
============================================================================ */

export function buildSellerSummary(analysis: AdsAnalysis): AdsSummary {
  const totalAds = analysis.totals.ads;

  const status =
    totalAds === 0
      ? "Inactive"
      : analysis.timeline.last_seen_days_ago !== null &&
        analysis.timeline.last_seen_days_ago > 30
      ? "Inactive (Historical Buyer)"
      : "Active";

  const bySurface = analysis.by_surface;
  const byFormat = analysis.by_format;

  const searchAds = byFormat.Search;
  const displayAds = byFormat.Display;
  const videoAds = byFormat.Video + byFormat.CTV;
  const otherAds = byFormat.Other;

  const formatMix: AdsSummary["ad_format_mix"] = (
    [
      { format: "Search Ads", count: searchAds },
      { format: "Display Ads", count: displayAds },
      { format: "Video Ads", count: videoAds },
      { format: "Other Ads", count: otherAds },
    ] as const
  ).map(
    (item): AdsSummary["ad_format_mix"][number] => ({
      ...item,
      share: percent(item.count, totalAds),
    })
  );

  const formatCount = [
    searchAds,
    displayAds,
    videoAds,
    otherAds,
  ].filter(count => count > 0).length;
  const hasVideo = videoAds > 0;
  const intensity = intensityFromVolume(totalAds);
  const sophistication = sophisticationFromFormats(formatCount);
  const experimentLevel = experimentationFromMix(formatCount, hasVideo);
  const searchShare = percent(searchAds, totalAds);
  const videoShare = percent(videoAds, totalAds);
  const strategyOrientation = orientationFromMix(searchShare, videoShare);
  const spendTier = tierFromSignal(totalAds, hasVideo);
  const scale = scaleFromVolume(totalAds);
  const adequacy = adequacyFromSpend(spendTier, intensity);
  const posture = postureFromSpend(spendTier, hasVideo);
  const averageLifespan = averageAdLifespanDays(analysis.ads);
  const alwaysOnPresence =
    status === "Active" &&
    analysis.timeline.ad_lifespan_days !== null &&
    analysis.timeline.ad_lifespan_days >= 180
      ? "Yes"
      : "No";

  return {
    domain: analysis.domain,

    advertising_activity_snapshot: {
      status,
      confidence_level: confidenceFromVolume(totalAds),
      analysis_window_days: ANALYSIS_WINDOW.days,
      region: ANALYSIS_WINDOW.region,
      sales_signal_strength: salesSignalFromVolume(totalAds),
      total_ads_detected: totalAds,
    },

    advertising_behavior_profile: {
      advertising_intensity: intensity,
      strategy_orientation: strategyOrientation,
      campaign_continuity: campaignContinuityFromLifespan(
        analysis.timeline.ad_lifespan_days
      ),
      format_sophistication: sophistication,
      experimentation_level: experimentLevel,
    },

    activity_timeline: {
      first_observed: analysis.timeline.first_seen,
      most_recent_activity: analysis.timeline.last_seen,
      ad_longevity_days: analysis.timeline.ad_lifespan_days,
      always_on_presence: alwaysOnPresence,
    },

    ad_format_mix: formatMix,

    campaign_stability_signals: {
      average_ad_lifespan_days: averageLifespan,
      creative_rotation:
        averageLifespan !== null && averageLifespan <= 14
          ? "High"
          : averageLifespan !== null && averageLifespan <= 45
          ? "Moderate"
          : "Low",
      burst_activity_detected:
        analysis.timeline.last_seen_days_ago !== null &&
        analysis.timeline.last_seen_days_ago <= 7 &&
        analysis.timeline.ad_lifespan_days !== null &&
        analysis.timeline.ad_lifespan_days <= 21
          ? "Yes"
          : "No",
      volatility_index:
        intensity === "High"
          ? "High"
          : intensity === "Moderate"
          ? "Medium"
          : "Low",
    },

    advertiser_scale: scale,

    estimated_monthly_media_spend: {
      spend_tier: spendTier,
    },

    spend_adequacy: adequacy,

    spend_posture: posture,

    sales_interpretation: {
      sell_with_opportunity:
        status === "Active"
          ? "Position recent activity as a signal to test incremental inventory."
          : "Re-engage with a lightweight package aligned to historical signals.",
      sell_against_opportunity:
        intensity === "High"
          ? "Emphasize competitive protection and share-of-voice defense."
          : "Highlight low-friction entry points to expand coverage.",
      outreach_recommendation:
        experimentLevel === "Aggressive"
          ? "Lead with multi-format bundles and advanced measurement."
          : "Start with a focused plan and scale once performance stabilizes.",
    },

    data_scope: {
      geography: "United States",
      lookback_window_days: ANALYSIS_WINDOW.days,
      source: ANALYSIS_WINDOW.source,
    },
  };
}
