import type { UpstreamAdsPayload } from "./upstream";

/* ============================================================================
   Public Types (Seller-Facing, Product-Ready)
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

  /* Video-only */
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
   Helpers
   ============================================================================ */

function normalizeDate(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function daysBetween(a: string, b: string): number {
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  if (Number.isNaN(x) || Number.isNaN(y) || y < x) return 0;
  return Math.floor((y - x) / 86400000) + 1;
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
  return (
    url.match(/v=([^&]+)/)?.[1] ??
    url.match(/youtu\.be\/([^?]+)/)?.[1] ??
    null
  );
}

function summarizeTranscript(payload: any): string | undefined {
  if (!Array.isArray(payload?.transcripts)) return undefined;
  return payload.transcripts.map((t: any) => t.text).join(" ");
}

/* ============================================================================
   Core Normalizer (ONE creative in → ONE creative out)
   ============================================================================ */

async function normalizeOne(
  creative: RawCreative,
  format: NormalizedCreative["format"],
  fetchAdDetails: NormalizeCreativesArgs["fetchAdDetails"],
  fetchTranscript: NormalizeCreativesArgs["fetchTranscript"]
): Promise<NormalizedCreative | null> {
  if (!creative.id || !creative.advertiser?.id) return null;

  const first = normalizeDate(creative.first_shown_datetime);
  const last = normalizeDate(creative.last_shown_datetime);
  if (!first || !last) return null;

  const details = await fetchAdDetails(
    creative.advertiser.id,
    creative.id
  );

  const variation = details?.variations?.[0];
  if (!variation) return null;

  const landing =
    variation.link ||
    variation.displayed_link ||
    variation.domain;

  const out: NormalizedCreative = {
    id: creative.id,
    name:
      variation.title ||
      variation.long_headline ||
      "Unnamed Creative",
    format,
    advertiser_name: creative.advertiser.name ?? "Unknown",
    first_seen: first,
    last_seen: last,
    days_active: daysBetween(first, last),
    call_to_action: variation.call_to_action,
    landing_domain: extractDomain(landing),
    creative_url: landing,
  };

  /* -------------------------
     VIDEO: transcript step
     ------------------------- */
  if (format === "Video Ads") {
    const ytUrl =
      variation.video_link ||
      variation.thumbnail;

    const videoId = extractYouTubeId(ytUrl);
    if (!videoId) return null;

    const transcript = await fetchTranscript(videoId);
    const text = summarizeTranscript(transcript);
    if (!text) return null;

    out.transcript_text = text;
    out.video_length_seconds =
      transcript?.transcripts?.reduce(
        (s: number, t: any) => s + (t.duration ?? 0),
        0
      ) ?? undefined;
  }

  return out;
}

/* ============================================================================
   Public API (FAST — MOST RECENT ONLY)
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
  const pick = (p?: UpstreamAdsPayload) =>
    p?.ad_creatives?.[0];

  return {
    search_ads: pick(search)
      ? [
          await normalizeOne(
            pick(search)!,
            "Search Ads",
            fetchAdDetails,
            fetchTranscript
          ),
        ].filter(Boolean)
      : [],

    display_ads: pick(display)
      ? [
          await normalizeOne(
            pick(display)!,
            "Display Ads",
            fetchAdDetails,
            fetchTranscript
          ),
        ].filter(Boolean)
      : [],

    video_ads: pick(video)
      ? [
          await normalizeOne(
            pick(video)!,
            "Video Ads",
            fetchAdDetails,
            fetchTranscript
          ),
        ].filter(Boolean)
      : [],
  };
}
