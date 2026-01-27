/**
 * normalize_creatives.ts
 *
 * PURPOSE
 * -------
 * Normalizes Google Ads Transparency Center *Ad Details* responses
 * into a unified creative-level model for the Creative Insights tool.
 *
 * IMPORTANT RULES (PER API DOCS)
 * ------------------------------
 * - Ad Details API is ALWAYS the source of truth
 * - This module NEVER fetches data
 * - Video ads are ONLY valid if a YouTube URL exists in variations
 * - Transcript fetching happens elsewhere
 */

export type NormalizedCreative = {
  id: string;
  format: "Search Ads" | "Display Ads" | "Video Ads";
  advertiser_name: string;
  first_seen: string;
  last_seen: string;
  days_active: number;

  /* Creative payload */
  headline?: string;
  description?: string;
  long_headline?: string;
  call_to_action?: string;
  landing_page?: string;
  image_url?: string;

  /* Video-only */
  youtube_url?: string;
};

/* ============================================================================
   Raw Ad Details Shapes (SearchAPI)
   ============================================================================ */

type AdDetailsResponse = {
  ad_information?: {
    format?: "text" | "image" | "video";
    first_shown_date?: string;
    last_shown_date?: string;
    last_shown_datetime?: string;
  };
  variations?: Array<Record<string, any>>;
};

type NormalizeCreativesArgs = {
  search?: AdDetailsResponse[];
  display?: AdDetailsResponse[];
  video?: AdDetailsResponse[];
};

/* ============================================================================
   Helpers
   ============================================================================ */

function normalizeDate(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function computeDaysActive(firstSeen: string, lastSeen: string): number {
  const first = new Date(firstSeen).getTime();
  const last = new Date(lastSeen).getTime();
  if (Number.isNaN(first) || Number.isNaN(last) || last < first) return 0;
  return Math.floor((last - first) / (1000 * 60 * 60 * 24)) + 1;
}

function extractYouTubeUrl(variations?: Array<Record<string, any>>): string | null {
  if (!variations) return null;

  for (const v of variations) {
    const candidates = [
      v.video_link,
      v.video_url,
      v.video?.url,
    ];

    for (const value of candidates) {
      if (
        typeof value === "string" &&
        (value.includes("youtube.com") || value.includes("youtu.be"))
      ) {
        return value;
      }
    }
  }

  return null;
}

/* ============================================================================
   Normalizers
   ============================================================================ */

function normalizeSearchOrDisplayCreative(
  details: AdDetailsResponse,
  format: "Search Ads" | "Display Ads",
  index: number
): NormalizedCreative | null {
  const info = details.ad_information;
  const variation = details.variations?.[0];

  const firstSeen = normalizeDate(info?.first_shown_date);
  const lastSeen = normalizeDate(info?.last_shown_date);

  if (!firstSeen || !lastSeen || !variation) return null;

  return {
    id: `${format}-${firstSeen}-${index}`,
    format,
    advertiser_name: variation.advertiser ?? "Unknown Advertiser",
    first_seen: firstSeen,
    last_seen: lastSeen,
    days_active: computeDaysActive(firstSeen, lastSeen),

    headline: variation.title,
    description: variation.snippet,
    long_headline: variation.long_headline,
    call_to_action: variation.call_to_action,
    landing_page: variation.link,
    image_url: variation.image,
  };
}

function normalizeVideoCreative(
  details: AdDetailsResponse,
  index: number
): NormalizedCreative | null {
  const info = details.ad_information;
  const variations = details.variations;

  const youtubeUrl = extractYouTubeUrl(variations);
  if (!youtubeUrl) return null;

  const firstSeen = normalizeDate(info?.first_shown_date);
  const lastSeen = normalizeDate(info?.last_shown_date);

  if (!firstSeen || !lastSeen) return null;

  return {
    id: `Video Ads-${firstSeen}-${index}`,
    format: "Video Ads",
    advertiser_name: variations?.[0]?.domain ?? "Unknown Advertiser",
    first_seen: firstSeen,
    last_seen: lastSeen,
    days_active: computeDaysActive(firstSeen, lastSeen),
    youtube_url: youtubeUrl,
  };
}

/* ============================================================================
   Public API
   ============================================================================ */

export function normalizeCreatives({
  search,
  display,
  video,
}: NormalizeCreativesArgs): {
  search_ads: NormalizedCreative[];
  display_ads: NormalizedCreative[];
  video_ads: NormalizedCreative[];
} {
  const search_ads =
    search?.map((d, i) => normalizeSearchOrDisplayCreative(d, "Search Ads", i))
      .filter(Boolean) as NormalizedCreative[] ?? [];

  const display_ads =
    display?.map((d, i) => normalizeSearchOrDisplayCreative(d, "Display Ads", i))
      .filter(Boolean) as NormalizedCreative[] ?? [];

  const video_ads =
    video?.map((d, i) => normalizeVideoCreative(d, i))
      .filter(Boolean) as NormalizedCreative[] ?? [];

  return {
    search_ads,
    display_ads,
    video_ads,
  };
}
