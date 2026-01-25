import { differenceInDays, parseISO, subDays } from "date-fns";

/**
 * ads_analysis.ts
 *
 * PURPOSE
 * -------
 * This module aggregates already-normalized advertising signals into a
 * neutral, time-bounded activity shape. It is intentionally:
 *
 * - Source-agnostic (no Google, BuiltWith, or vendor logic)
 * - Technology-agnostic (no pixels, platforms, or partners)
 * - Sales-agnostic (no spend, confidence, or strategy inference)
 *
 * It acts as the boundary between upstream detection/normalization and
 * downstream seller intelligence.
 */

/* ------------------------------------------------------------------ */
/* Canonical Formats                                                    */
/* ------------------------------------------------------------------ */

export type CanonicalAdFormat =
  | "Search Ads"
  | "Display Ads"
  | "Video Ads"
  | "Other Ads";

/* ------------------------------------------------------------------ */
/* Normalized Input Shape                                               */
/* ------------------------------------------------------------------ */

export type NormalizedAdSignal = {
  format: CanonicalAdFormat;
  first_seen: string; // ISO date string
  last_seen: string;  // ISO date string
};

/* ------------------------------------------------------------------ */
/* Analysis Output Shape                                                */
/* ------------------------------------------------------------------ */

export type AdsAnalysis = {
  domain: string;
  total_ads: number;
  formats: Record<CanonicalAdFormat, number>;
  ads: NormalizedAdSignal[];
  first_seen: string | null;
  last_seen: string | null;
  ad_lifespan_days: number | null;
  last_seen_days_ago: number | null;
};

/* ------------------------------------------------------------------ */
/* Analysis Window                                                      */
/* ------------------------------------------------------------------ */

const ANALYSIS_WINDOW_DAYS = 365;

export const ANALYSIS_WINDOW = {
  days: ANALYSIS_WINDOW_DAYS,
  region: "US",
  source: "Normalized Advertising Signals",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isValidISODate(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  const parsed = parseISO(value);
  return !Number.isNaN(parsed.getTime());
}

function isWithinWindow(lastSeen: string): boolean {
  const parsed = parseISO(lastSeen);
  return parsed >= subDays(new Date(), ANALYSIS_WINDOW_DAYS);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

type AnalyzeAdsArgs = {
  domain: string;
  ads: NormalizedAdSignal[];
};

export function analyzeAds({
  domain,
  ads,
}: AnalyzeAdsArgs): AdsAnalysis {
  const windowedAds = ads
    .filter(ad => isValidISODate(ad.first_seen))
    .filter(ad => isValidISODate(ad.last_seen))
    .filter(ad => isWithinWindow(ad.last_seen));

  const formats: Record<CanonicalAdFormat, number> = {
    "Search Ads": 0,
    "Display Ads": 0,
    "Video Ads": 0,
    "Other Ads": 0,
  };

  const firstSeenDates: Date[] = [];
  const lastSeenDates: Date[] = [];

  for (const ad of windowedAds) {
    formats[ad.format] += 1;
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

  const adLifespanDays =
    firstSeen && lastSeen ? differenceInDays(lastSeen, firstSeen) : null;

  const lastSeenDaysAgo =
    lastSeen ? differenceInDays(new Date(), lastSeen) : null;

  return {
    domain,
    total_ads: windowedAds.length,
    formats,
    ads: windowedAds,
    first_seen: firstSeen ? firstSeen.toISOString() : null,
    last_seen: lastSeen ? lastSeen.toISOString() : null,
    ad_lifespan_days: adLifespanDays,
    last_seen_days_ago: lastSeenDaysAgo,
  };
}
