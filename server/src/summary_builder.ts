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
  ).map(item => ({
    ...item,
    share: percent(item.count, totalAds),
  }));

  const formatCount = [searchAds, displayAds, videoAds, otherAds].filter(
    count => count > 0
  ).length;

  const hasVideo = videoAds > 0;
  const intensity = intensityFromVolume(totalAds);
  const sophistication = sophisticationFromFormats(formatCount);
  const experimentLevel = experimentationFromMix(formatCount, hasVideo);
  const searchShare = percent(searchAds, totalAds);
  const videoShare = percent(videoAds, totalAds);
  const strategyOrientation = orientationFromMix(searchShare, videoShare);
  const averageLifespan = averageAdLifespanDays(analysis.ads);

  const alwaysOnPresence =
    status === "Active" &&
    analysis.timeline.ad_lifespan_days !== null &&
    analysis.timeline.ad_lifespan_days >= 180
      ? "Yes"
      : "No";

  /** 🔒 STEP 1 FIX:
   *  Scale is no longer inferred from ad volume.
   *  This will be resolved by business identity in the next step.
   */
  const scale: AdsSummary["advertiser_scale"] = {
    scale_classification: "Local",
    geographic_focus: "Single-market",
    buying_complexity: "Simple",
  };

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
