import { differenceInDays, parseISO } from "date-fns";
import type {
  AdsAnalysis,
  CanonicalAdFormat,
  AdSurface,
} from "./ads_analysis";
import { ANALYSIS_WINDOW } from "./ads_analysis";

/* ============================================================================
   Types
============================================================================ */

export type SpendLevel = "$" | "$$" | "$$$" | "$$$$";

export type SellerSummary = {
  domain: string;

  activity_snapshot: {
    status: "Active" | "Inactive" | "Inactive (Historical Buyer)";
    confidence: "Low" | "Medium" | "High";
    total_ads_detected: number;
    analysis_window_days: number;
    region: string;
  };

  channel_signal_profile: {
    has_search: boolean;
    has_display: boolean;
    has_programmatic_video: boolean;
    has_youtube: boolean;
    has_ctv: boolean;
    multi_video_signal: boolean;
  };

  activity_timeline: {
    first_seen: string | null;
    last_seen: string | null;
    ad_lifespan_days: number | null;
    always_on: "Yes" | "No";
  };

  format_mix: Array<{
    format: CanonicalAdFormat;
    surface: AdSurface;
    count: number;
    share: number;
  }>;

  inferred_spend: {
    level: SpendLevel;
    confidence: "Low" | "Medium" | "High";
  };

  sales_guidance: {
    posture: "Experimental" | "Scaling" | "Aggressive";
    opportunity_signal: string;
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

const confidenceFromVolume = (totalAds: number): "Low" | "Medium" | "High" =>
  totalAds < 5 ? "Low" : totalAds < 15 ? "Medium" : "High";

const spendLevelFromSignal = (
  totalAds: number,
  multiVideo: boolean,
  hasCTV: boolean
): SpendLevel => {
  if (hasCTV && multiVideo) return "$$$$";
  if (multiVideo) return "$$$";
  if (totalAds >= 10) return "$$";
  return "$";
};

/* ============================================================================
   Builder
============================================================================ */

export function buildSellerSummary(analysis: AdsAnalysis): SellerSummary {
  const totalAds = analysis.totals.ads;

  const status =
    totalAds === 0
      ? "Inactive"
      : analysis.timeline.last_seen_days_ago !== null &&
        analysis.timeline.last_seen_days_ago > 30
      ? "Inactive (Historical Buyer)"
      : "Active";

  const bySurface = analysis.by_surface;
  const byFormatSurface = analysis.by_format_surface;

  const hasSearch = bySurface["Search Network"] > 0;
  const hasDisplay = bySurface["Programmatic Display"] > 0;
  const hasProgVideo = bySurface["Programmatic Video"] > 0;
  const hasYouTube = bySurface["YouTube"] > 0;
  const hasCTV = bySurface["Connected TV"] > 0;

  const multiVideoSignal =
    [hasProgVideo, hasYouTube, hasCTV].filter(Boolean).length >= 2;

  const formatMix = Object.entries(byFormatSurface).map(([key, count]) => {
    const [format, surface] = key.split("::");
    return {
      format: format as CanonicalAdFormat,
      surface: surface as AdSurface,
      count,
      share: percent(count, totalAds),
    };
  });

  const spendLevel = spendLevelFromSignal(
    totalAds,
    multiVideoSignal,
    hasCTV
  );

  return {
    domain: analysis.domain,

    activity_snapshot: {
      status,
      confidence: confidenceFromVolume(totalAds),
      total_ads_detected: totalAds,
      analysis_window_days: ANALYSIS_WINDOW.days,
      region: ANALYSIS_WINDOW.region,
    },

    channel_signal_profile: {
      has_search: hasSearch,
      has_display: hasDisplay,
      has_programmatic_video: hasProgVideo,
      has_youtube: hasYouTube,
      has_ctv: hasCTV,
      multi_video_signal: multiVideoSignal,
    },

    activity_timeline: {
      first_seen: analysis.timeline.first_seen,
      last_seen: analysis.timeline.last_seen,
      ad_lifespan_days: analysis.timeline.ad_lifespan_days,
      always_on:
        status === "Active" &&
        analysis.timeline.ad_lifespan_days !== null &&
        analysis.timeline.ad_lifespan_days >= 180
          ? "Yes"
          : "No",
    },

    format_mix: formatMix,

    inferred_spend: {
      level: spendLevel,
      confidence: confidenceFromVolume(totalAds),
    },

    sales_guidance: {
      posture:
        spendLevel === "$$$$"
          ? "Aggressive"
          : spendLevel === "$$$"
          ? "Scaling"
          : "Experimental",
      opportunity_signal: multiVideoSignal
        ? "Multi-surface video advertiser with escalation potential"
        : hasSearch && !hasVideoSignals(bySurface)
        ? "Search-led advertiser, early funnel expansion opportunity"
        : "Selective advertiser with room to broaden channel mix",
    },

    data_scope: {
      geography: "United States",
      lookback_window_days: ANALYSIS_WINDOW.days,
      source: ANALYSIS_WINDOW.source,
    },
  };
}

/* ============================================================================
   Internal Guards
============================================================================ */

function hasVideoSignals(bySurface: AdsAnalysis["by_surface"]): boolean {
  return (
    bySurface["Programmatic Video"] > 0 ||
    bySurface["YouTube"] > 0 ||
    bySurface["Connected TV"] > 0
  );
}
