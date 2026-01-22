import { differenceInDays, parseISO, subDays } from "date-fns";
import type { UpstreamAdsPayload } from "./upstream";

export type CanonicalAdFormat =
  | "Search Ads"
  | "Display Ads"
  | "Video Ads"
  | "Other Ads";

export type AnalyzedAd = {
  format: CanonicalAdFormat;
  first_seen: string;
  last_seen: string;
};

export type AdsAnalysis = {
  domain: string;
  total_ads: number;
  formats: Record<CanonicalAdFormat, number>;
  ads: AnalyzedAd[];
  first_seen: string | null;
  last_seen: string | null;
  ad_lifespan_days: number | null;
  last_seen_days_ago: number | null;
};

const ANALYSIS_WINDOW_DAYS = 365;

export const ANALYSIS_WINDOW = {
  days: ANALYSIS_WINDOW_DAYS,
  region: "US",
  source: "Google Ads Transparency Center",
};

export function normalizeFormat(
  format: "text" | "image" | "video" | null | undefined
): CanonicalAdFormat {
  if (format === "text") {
    return "Search Ads";
  }

  if (format === "image") {
    return "Display Ads";
  }

  if (format === "video") {
    return "Video Ads";
  }

  return "Other Ads";
}

function isWithinWindow(lastSeen: string | undefined): boolean {
  if (!lastSeen) {
    return false;
  }

  const parsed = parseISO(lastSeen);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed >= subDays(new Date(), ANALYSIS_WINDOW_DAYS);
}

type AnalyzeAdsArgs = {
  domain: string;
  upstream: UpstreamAdsPayload;
  targetDomain?: string | null;
};

export function analyzeAds({
  domain,
  upstream,
  targetDomain,
}: AnalyzeAdsArgs): AdsAnalysis {
  const ads = Array.isArray(upstream.ad_creatives)
    ? upstream.ad_creatives
        .filter(ad => isWithinWindow(ad.last_shown_datetime))
        .filter(ad =>
          targetDomain ? ad.target_domain === targetDomain : true
        )
        .filter(
          ad =>
            Boolean(ad.first_shown_datetime) &&
            Boolean(ad.last_shown_datetime)
        )
        .map(ad => ({
          format: normalizeFormat(ad.format ?? null),
          first_seen: ad.first_shown_datetime ?? "",
          last_seen: ad.last_shown_datetime ?? "",
        }))
    : [];

  const formats: Record<CanonicalAdFormat, number> = {
    "Search Ads": 0,
    "Display Ads": 0,
    "Video Ads": 0,
    "Other Ads": 0,
  };

  const firstSeenDates: Date[] = [];
  const lastSeenDates: Date[] = [];

  for (const ad of ads) {
    formats[ad.format] += 1;
    firstSeenDates.push(parseISO(ad.first_seen));
    lastSeenDates.push(parseISO(ad.last_seen));
  }

  const firstSeen =
    firstSeenDates.length > 0
      ? new Date(Math.min(...firstSeenDates.map(date => date.getTime())))
      : null;
  const lastSeen =
    lastSeenDates.length > 0
      ? new Date(Math.max(...lastSeenDates.map(date => date.getTime())))
      : null;

  const adLifespanDays =
    firstSeen && lastSeen ? differenceInDays(lastSeen, firstSeen) : null;
  const lastSeenDaysAgo =
    lastSeen ? differenceInDays(new Date(), lastSeen) : null;

  return {
    domain,
    total_ads: ads.length,
    formats,
    ads,
    first_seen: firstSeen ? firstSeen.toISOString() : null,
    last_seen: lastSeen ? lastSeen.toISOString() : null,
    ad_lifespan_days: adLifespanDays,
    last_seen_days_ago: lastSeenDaysAgo,
  };
}
