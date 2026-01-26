import { differenceInDays, parseISO, subDays } from "date-fns";

/**
 * ads_analysis.ts
 *
 * PURPOSE
 * -------
 * Aggregates normalized advertising signals into a neutral,
 * time-bounded activity model.
 *
 * This module is deliberately:
 * - Source-agnostic
 * - Vendor-agnostic
 * - Spend-agnostic
 * - Inference-free
 *
 * It preserves maximum signal resolution so downstream layers
 * (format weighting, forecasting, seller logic, UI) can reason
 * without information loss.
 */

/* ------------------------------------------------------------------
   Canonical Ad Formats (WHAT the ad is)
------------------------------------------------------------------ */

export type CanonicalAdFormat =
  | "Search"
  | "Display"
  | "Video"
  | "CTV"
  | "Other";

/* ------------------------------------------------------------------
   Delivery Surfaces (WHERE the ad runs)
------------------------------------------------------------------ */

export type AdSurface =
  | "Search Network"
  | "Programmatic Display"
  | "Programmatic Video"
  | "YouTube"
  | "Connected TV"
  | "Social Feed"
  | "Other";

/* ------------------------------------------------------------------
   Normalized Input Signal
------------------------------------------------------------------ */

export type NormalizedAdSignal = {
  format: CanonicalAdFormat;
  surface: AdSurface;
  first_seen: string; // ISO 8601
  last_seen: string;  // ISO 8601
};

/* ------------------------------------------------------------------
   Analysis Output Shape
------------------------------------------------------------------ */

export type AdsAnalysis = {
  domain: string;

  totals: {
    ads: number;
  };

  by_format: Record<CanonicalAdFormat, number>;
  by_surface: Record<AdSurface, number>;
  by_format_surface: Record<string, number>; // `${format}::${surface}`

  ads: NormalizedAdSignal[];

  timeline: {
    first_seen: string | null;
    last_seen: string | null;
    ad_lifespan_days: number | null;
    last_seen_days_ago: number | null;
  };

  /**
   * Optional infrastructure enrichment (e.g. BuiltWith).
   * Passed explicitly from tools.ts.
   * This layer does not fetch or interpret it.
   */
  infrastructure?: unknown | null;
};

/* ------------------------------------------------------------------
   Analysis Window
------------------------------------------------------------------ */

const ANALYSIS_WINDOW_DAYS = 365;

export const ANALYSIS_WINDOW = {
  days: ANALYSIS_WINDOW_DAYS,
  region: "US",
  source: "Google Ads Transparency Center",
};

/* ------------------------------------------------------------------
   Helpers
------------------------------------------------------------------ */

function isValidISODate(value?: string): value is string {
  if (!value) return false;
  const parsed = parseISO(value);
  return !Number.isNaN(parsed.getTime());
}

function isWithinWindow(lastSeen: string): boolean {
  return parseISO(lastSeen) >= subDays(new Date(), ANALYSIS_WINDOW_DAYS);
}

/* ------------------------------------------------------------------
   Public API
------------------------------------------------------------------ */

type AnalyzeAdsArgs = {
  domain: string;
  ads: NormalizedAdSignal[];
  infrastructure?: unknown | null;
};

export function analyzeAds({
  domain,
  ads,
  infrastructure,
}: AnalyzeAdsArgs): AdsAnalysis {
  const windowedAds = ads
    .filter(ad => isValidISODate(ad.first_seen))
    .filter(ad => isValidISODate(ad.last_seen))
    .filter(ad => isWithinWindow(ad.last_seen));

  const by_format: Record<CanonicalAdFormat, number> = {
    Search: 0,
    Display: 0,
    Video: 0,
    CTV: 0,
    Other: 0,
  };

  const by_surface: Record<AdSurface, number> = {
    "Search Network": 0,
    "Programmatic Display": 0,
    "Programmatic Video": 0,
    YouTube: 0,
    "Connected TV": 0,
    "Social Feed": 0,
    Other: 0,
  };

  const by_format_surface: Record<string, number> = {};

  const firstSeenDates: Date[] = [];
  const lastSeenDates: Date[] = [];

  for (const ad of windowedAds) {
    by_format[ad.format] += 1;
    by_surface[ad.surface] += 1;

    const compositeKey = `${ad.format}::${ad.surface}`;
    by_format_surface[compositeKey] =
      (by_format_surface[compositeKey] ?? 0) + 1;

    firstSeenDates.push(parseISO(ad.first_seen));
    lastSeenDates.push(parseISO(ad.last_seen));
  }

  const firstSeen =
    firstSeenDates.length > 0
      ? new Date(Math.min(...firstSeenDates.map(d => d.getTime())))
      : null;

  const lastSeen =
    lastSeenDates.length > 0
      ? new Date(Math.max(...lastSeenDates.map(d => d.getTime())))
      : null;

  return {
    domain,

    totals: {
      ads: windowedAds.length,
    },

    by_format,
    by_surface,
    by_format_surface,

    ads: windowedAds,

    timeline: {
      first_seen: firstSeen ? firstSeen.toISOString() : null,
      last_seen: lastSeen ? lastSeen.toISOString() : null,
      ad_lifespan_days:
        firstSeen && lastSeen ? differenceInDays(lastSeen, firstSeen) : null,
      last_seen_days_ago:
        lastSeen ? differenceInDays(new Date(), lastSeen) : null,
    },

    infrastructure,
  };
}
