/**
 * normalize_creatives.ts
 *
 * PURPOSE
 * -------
 * Translates raw Google Ads Transparency Center creatives
 * into canonical, analysis-safe ad signals.
 *
 * DESIGN RULES
 * ------------
 * - Vendor-specific fields are stripped
 * - Only time-bounded signals survive
 * - Video ads are ONLY emitted if a YouTube URL is detected
 * - Output is safe for AdsAnalysis
 */

import type {
  NormalizedAdSignal,
  CanonicalAdFormat,
  AdSurface,
} from "./ads_analysis";

/* ============================================================================
   Raw Creative Shape (SearchAPI subset)
   ============================================================================ */

type RawCreative = {
  first_shown_datetime?: string;
  last_shown_datetime?: string;
  format?: string;
  details_link?: string;
  details_script_link?: string;
};

/* ============================================================================
   Helpers
   ============================================================================ */

function hasValidDates(c: RawCreative): boolean {
  return Boolean(c.first_shown_datetime && c.last_shown_datetime);
}

function extractYouTubeUrl(c: RawCreative): string | null {
  const candidates = [
    c.details_link,
    c.details_script_link,
  ].filter(Boolean) as string[];

  for (const url of candidates) {
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      return url;
    }
  }

  return null;
}

function mapFormat(format?: string): CanonicalAdFormat | null {
  switch (format) {
    case "text":
      return "Search";
    case "image":
      return "Display";
    case "video":
      return "Video";
    default:
      return null;
  }
}

function mapSurface(
  canonicalFormat: CanonicalAdFormat,
  hasYouTube: boolean
): AdSurface {
  if (canonicalFormat === "Search") return "Search Network";
  if (canonicalFormat === "Display") return "Programmatic Display";
  if (canonicalFormat === "Video") {
    return hasYouTube ? "YouTube" : "Programmatic Video";
  }
  return "Other";
}

/* ============================================================================
   Public API
   ============================================================================ */

export function normalizeCreatives(input: {
  upstream: { ad_creatives?: RawCreative[] };
}): NormalizedAdSignal[] {
  const creatives = input.upstream.ad_creatives ?? [];
  const normalized: NormalizedAdSignal[] = [];

  for (const creative of creatives) {
    if (!hasValidDates(creative)) continue;

    const canonicalFormat = mapFormat(creative.format);
    if (!canonicalFormat) continue;

    /**
     * SPECIAL RULE: VIDEO
     * -------------------
     * Video ads are only reported if a YouTube URL exists.
     */
    let youtubeUrl: string | null = null;

    if (canonicalFormat === "Video") {
      youtubeUrl = extractYouTubeUrl(creative);
      if (!youtubeUrl) continue; // HARD FILTER
    }

    const surface = mapSurface(canonicalFormat, Boolean(youtubeUrl));

    normalized.push({
      format: canonicalFormat,
      surface,
      first_seen: creative.first_shown_datetime!,
      last_seen: creative.last_shown_datetime!,
    });
  }

  return normalized;
}
