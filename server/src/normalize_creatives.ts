import type { UpstreamAdsPayload } from "./upstream";

/* ============================================================================
   Public Types
   ============================================================================ */

export type NormalizedCreative = {
  id: string;
  name: string;
  format: "Search Ads" | "Display Ads" | "Video Ads";
  advertiser_name: string;

  first_seen: string;
  last_seen: string;
  days_active: number;

  call_to_action?: string;
  landing_domain?: string;
  creative_url?: string;

  /** Video-only */
  video_length_seconds?: number;
  transcript_text?: string;
};

/* ============================================================================
   Internal Types
   ============================================================================ */

type RawCreative = NonNullable<UpstreamAdsPayload["ad_creatives"]>[number];

type NormalizeCreativesArgs = {
  search?: UpstreamAdsPayload;
  display?: UpstreamAdsPayload;
  video?: UpstreamAdsPayload;

  fetchAdDetails: (
    advertiser_id: string,
    creative_id: string
  ) => Promise<any>;

  fetchTranscript: (videoId: string) => Promise<any>;
};

/* ============================================================================
   Safety Limits (CRITICAL)
   ============================================================================ */

/**
 * HARD SAFETY CAPS
 * ----------------
 * Prevents accidental 100+ API call explosions.
 */
const MAX_CREATIVES_PER_FORMAT = 10;

/* ============================================================================
   Helpers
   ============================================================================ */

function normalizeDate(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function computeDaysActive(first: string, last: string): number {
  const f = new Date(first).getTime();
  const l = new Date(last).getTime();
  if (Number.isNaN(f) || Number.isNaN(l) || l < f) return 0;
  return Math.floor((l - f) / 86400000) + 1;
}

function extractDomain(url?: string): string | undefined {
  try {
    if (!url) return undefined;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function extractYouTubeId(url?: string): string | null {
  if (!url) return null;
  const match =
    url.match(/v=([^&]+)/) ||
    url.match(/youtu\.be\/([^?]+)/);
  return match?.[1] ?? null;
}

function summarizeTranscript(transcript: any): string | undefined {
  if (!Array.isArray(transcript?.transcripts)) return undefined;
  return transcript.transcripts.map((t: any) => t.text).join(" ");
}

/* ============================================================================
   Core Normalization
   ============================================================================ */

async function normalizeOneCreative(
  creative: RawCreative,
  format: NormalizedCreative["format"],
  index: number,
  fetchAdDetails: NormalizeCreativesArgs["fetchAdDetails"],
  fetchTranscript: NormalizeCreativesArgs["fetchTranscript"]
): Promise<NormalizedCreative | null> {
  if (!creative.id || !creative.advertiser?.id) return null;

  const firstSeen = normalizeDate(creative.first_shown_datetime);
  const lastSeen = normalizeDate(creative.last_shown_datetime);
  if (!firstSeen || !lastSeen) return null;

  const details = await fetchAdDetails(
    creative.advertiser.id,
    creative.id
  );

  const variations = details?.variations ?? [];
  const primary = variations[0] ?? {};

  const landingUrl =
    primary.link ||
    primary.displayed_link ||
    primary.domain;

  const normalized: NormalizedCreative = {
    id: creative.id,
    name:
      primary.title ||
      primary.long_headline ||
      `Creative ${index + 1}`,
    format,
    advertiser_name: creative.advertiser.name ?? "Unknown",
    first_seen: firstSeen,
    last_seen: lastSeen,
    days_active: computeDaysActive(firstSeen, lastSeen),
    call_to_action: primary.call_to_action,
    landing_domain: extractDomain(landingUrl),
    creative_url: landingUrl,
  };

  /* ------------------------------
     VIDEO: transcript enrichment
     ------------------------------ */
  if (format === "Video Ads") {
    const youtubeUrl =
      primary.video_link ||
      primary.thumbnail ||
      undefined;

    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) return null; // HARD FILTER

    const transcript = await fetchTranscript(videoId);
    const transcriptText = summarizeTranscript(transcript);

    if (!transcriptText) return null; // HARD FILTER

    normalized.transcript_text = transcriptText;
    normalized.video_length_seconds =
      transcript?.transcripts?.reduce(
        (sum: number, t: any) => sum + (t.duration ?? 0),
        0
      ) ?? undefined;
  }

  return normalized;
}

/* ============================================================================
   Public API
   ============================================================================ */

export async function normalizeCreatives({
  search,
  display,
  video,
  fetchAdDetails,
  fetchTranscript,
}: NormalizeCreativesArgs): Promise<{
  search_ads: NormalizedCreative[];
  display_ads: NormalizedCreative[];
  video_ads: NormalizedCreative[];
}> {
  const out = {
    search_ads: [] as NormalizedCreative[],
    display_ads: [] as NormalizedCreative[],
    video_ads: [] as NormalizedCreative[],
  };

  const process = async (
    creatives: RawCreative[] | undefined,
    format: NormalizedCreative["format"]
  ) => {
    if (!creatives) return [];
    const slice = creatives.slice(0, MAX_CREATIVES_PER_FORMAT);
    const results: NormalizedCreative[] = [];

    for (const [i, c] of slice.entries()) {
      const normalized = await normalizeOneCreative(
        c,
        format,
        i,
        fetchAdDetails,
        fetchTranscript
      );
      if (normalized) results.push(normalized);
    }

    return results;
  };

  out.search_ads = await process(search?.ad_creatives, "Search Ads");
  out.display_ads = await process(display?.ad_creatives, "Display Ads");
  out.video_ads = await process(video?.ad_creatives, "Video Ads");

  return out;
}
