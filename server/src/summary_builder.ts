import { differenceInDays, parseISO } from "date-fns";
import type { AdsAnalysis, CanonicalAdFormat } from "./ads_analysis";
import { ANALYSIS_WINDOW } from "./ads_analysis";

/* ============================================================================
   Types
   ============================================================================ */

export type SpendLevel = "$" | "$$" | "$$$" | "$$$$";

export type SellerSummary = {
  domain: string;

  advertising_activity_snapshot: {
    status: "Active" | "Inactive" | "Inactive (Historical Buyer)";
    confidence_level: "Low" | "Medium" | "High";
    analysis_window_days: number;
    region: string;
    total_ads_detected: number;
  };

  channel_presence: {
    youtube_video: boolean;
    programmatic_video: boolean;
    ctv: boolean;
  };

  estimated_media_spend: {
    spend_level: SpendLevel;
    confidence: "Low" | "Medium" | "High";
  };

  ad_format_mix: Array<{
    format: CanonicalAdFormat;
    count: number;
    share: number;
  }>;

  activity_timeline: {
    first_observed: string | null;
    most_recent_activity: string | null;
    ad_longevity_days: number | null;
  };

  data_scope: {
    geography: string;
    lookback_window_days: number;
    source: string;
  };
};

/* ============================================================================
   Constants (LOCKED WEIGHTS)
   ============================================================================ */

const CHANNEL_WEIGHTS = {
  YOUTUBE_VIDEO: 1.0,
  PROGRAMMATIC_VIDEO: 0.7,
  CTV: 2.0,
} as const;

/* ============================================================================
   Helpers
   ============================================================================ */

const percent = (count: number, total: number) =>
  total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;

const confidenceFromSignals = (signals: number): "Low" | "Medium" | "High" =>
  signals >= 2 ? "High" : signals === 1 ? "Medium" : "Low";

/* ============================================================================
   Spend Scoring (CORE LOGIC — DO NOT DRIFT)
   ============================================================================ */

function scoreToSpendLevel(score: number): SpendLevel {
  if (score < 1.0) return "$";
  if (score < 2.0) return "$$";
  if (score < 3.0) return "$$$";
  return "$$$$";
}

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

  /* ------------------------------------------------------------------------
     Channel Detection (FROM YOUR APIs)
     ------------------------------------------------------------------------ */

  const hasYouTubeVideo =
    (analysis.platforms?.youtube_video ?? 0) > 0;

  const hasProgrammaticVideo =
    (analysis.platforms?.programmatic_video ?? 0) > 0;

  const hasCTV =
    (analysis.channels?.ctv ?? 0) > 0;

  /* ------------------------------------------------------------------------
     Spend Scoring (ADDITIVE, COMBINATORIAL)
     ------------------------------------------------------------------------ */

  let spendScore = 0;
  let signalCount = 0;

  if (hasYouTubeVideo) {
    spendScore += CHANNEL_WEIGHTS.YOUTUBE_VIDEO;
    signalCount++;
  }

  if (hasProgrammaticVideo) {
    spendScore += CHANNEL_WEIGHTS.PROGRAMMATIC_VIDEO;
    signalCount++;
  }

  if (hasCTV) {
    spendScore += CHANNEL_WEIGHTS.CTV;
    signalCount++;
  }

  const spendLevel = scoreToSpendLevel(spendScore);
  const confidence = hasCTV ? "High" : confidenceFromSignals(signalCount);

  /* ------------------------------------------------------------------------
     Format Mix
     ------------------------------------------------------------------------ */

  const formatMix = Object.entries(analysis.formats)
    .filter(([, count]) => count > 0)
    .map(([format, count]) => ({
      format: format as CanonicalAdFormat,
      count,
      share: percent(count, totalAds),
    }));

  /* ------------------------------------------------------------------------
     Timeline
     ------------------------------------------------------------------------ */

  const adLongevity =
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
      : null;

  /* ------------------------------------------------------------------------
     Output
     ------------------------------------------------------------------------ */

  return {
    domain: analysis.domain,

    advertising_activity_snapshot: {
      status,
      confidence_level:
        totalAds < 5 ? "Low" : totalAds < 15 ? "Medium" : "High",
      analysis_window_days: ANALYSIS_WINDOW.days,
      region: ANALYSIS_WINDOW.region,
      total_ads_detected: totalAds,
    },

    channel_presence: {
      youtube_video: hasYouTubeVideo,
      programmatic_video: hasProgrammaticVideo,
      ctv: hasCTV,
    },

    estimated_media_spend: {
      spend_level: spendLevel,
      confidence,
    },

    ad_format_mix: formatMix,

    activity_timeline: {
      first_observed: analysis.first_seen,
      most_recent_activity: analysis.last_seen,
      ad_longevity_days: adLongevity,
    },

    data_scope: {
      geography: "United States",
      lookback_window_days: ANALYSIS_WINDOW.days,
      source: ANALYSIS_WINDOW.source,
    },
  };
}
