import type { UpstreamAdsPayload } from "./upstream";

/* ============================================================================
   Public Output Shape (INTERNAL – NOT USER-FACING)
   ============================================================================ */

export type NormalizedCreative = {
  id: string;
  format: "Search Ads" | "Display Ads" | "Video Ads";

  name: string; // human-readable creative name
  advertiser_name: string;

  first_seen: string;
  last_seen: string;
  days_active: number;

  call_to_action?: string;
  destination_domains?: string[];

  creative_url?: string;     // display + search
  youtube_url?: string;      // video only
  video_duration_seconds?: number;
  transcript?: string;       // video only
};

/* ============================================================================
   Types
   ============================================================================ */

type RawCreative = NonNullable<UpstreamAdsPayload["ad_creatives"]>[number];

type AdDetailsResponse = any;
type TranscriptResponse = {
  transcripts?: Array<{ text?: string }>;
};

type NormalizeCreativesArgs = {
  search?: UpstreamAdsPayload;
  display?: UpstreamAdsPayload;
  video?: UpstreamAdsPayload;

  fetchAdDetails: (advertiserId: string, creativeId: string) => Promise<AdDetailsResponse>;
  fetchTranscript: (videoId: string) => Promise<TranscriptResponse>;
};

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
  if (l < f) return 0;
  return Math.floor((l - f) / (1000 * 60 * 60 * 24)) + 1;
}

function extractDomains(details: any): string[] {
  const domains = new Set<string>();

  const variations = details?.variations ?? [];
  for (const v of variations) {
    if (typeof v?.domain === "string") {
      domains.add(v.domain);
    }
    if (typeof v?.link === "string") {
      try {
        domains.add(new URL(v.link).hostname);
      } catch {}
    }
  }

  return Array.from(domains);
}

function extractCTA(details: any): string | undefined {
  const variations = details?.variations ?? [];
  for (const v of variations) {
    if (typeof v?.call_to_action === "string") {
      return v.call_to_action;
    }
  }
  return undefined;
}

function extractCreativeUrl(details: any): string | undefined {
  const variations = details?.variations ?? [];
  for (const v of variations) {
    if (typeof v?.link === "string") return v.link;
    if (typeof v?.image === "string") return v.image;
  }
  return undefined;
}

function extractYouTube(details: any): { url?: string; videoId?: string } {
  const variations = details?.variations ?? [];
  for (const v of variations) {
    if (typeof v?.video_link === "string") {
      const url = v.video_link;
      const match = url.match(/[?&]v=([^&]+)/);
      return { url, videoId: match?.[1] };
    }
  }
  return {};
}

function collapseTranscript(resp: TranscriptResponse): string | undefined {
  if (!Array.isArray(resp.transcripts)) return undefined;
  return resp.transcripts
    .map(t => t.text)
    .filter(Boolean)
    .join(" ");
}

/* ============================================================================
   Core Normalization
   ============================================================================ */

async function normalizeCreative(
  creative: RawCreative,
  format: NormalizedCreative["format"],
  index: number,
  fetchAdDetails: NormalizeCreativesArgs["fetchAdDetails"],
  fetchTranscript: NormalizeCreativesArgs["fetchTranscript"]
): Promise<NormalizedCreative | null> {
  const firstSeen = normalizeDate(creative.first_shown_datetime);
  const lastSeen = normalizeDate(creative.last_shown_datetime);
  if (!firstSeen || !lastSeen) return null;

  const advertiserId = creative.advertiser?.id;
  const creativeId = creative.id;
  if (!advertiserId || !creativeId) return null;

  const details = await fetchAdDetails(advertiserId, creativeId);

  const base: NormalizedCreative = {
    id: creativeId,
    format,
    name: `${creative.advertiser?.name ?? "Advertiser"} – ${format} #${index + 1}`,
    advertiser_name: creative.advertiser?.name ?? "Unknown",
    first_seen: firstSeen,
    last_seen: lastSeen,
    days_active: computeDaysActive(firstSeen, lastSeen),
    call_to_action: extractCTA(details),
    destination_domains: extractDomains(details),
    creative_url: extractCreativeUrl(details),
  };

  /* -------------------------
     VIDEO SPECIAL HANDLING
  ------------------------- */
  if (format === "Video Ads") {
    const { url, videoId } = extractYouTube(details);
    if (!url || !videoId) return null;

    const transcriptResp = await fetchTranscript(videoId);
    const transcript = collapseTranscript(transcriptResp);
    if (!transcript) return null;

    base.youtube_url = url;
    base.transcript = transcript;
  }

  return base;
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
  async function run(
    creatives: RawCreative[] | undefined,
    format: NormalizedCreative["format"]
  ) {
    if (!creatives) return [];
    const out: NormalizedCreative[] = [];
    for (const [i, c] of creatives.entries()) {
      const n = await normalizeCreative(
        c,
        format,
        i,
        fetchAdDetails,
        fetchTranscript
      );
      if (n) out.push(n);
    }
    return out;
  }

  return {
    search_ads: await run(search?.ad_creatives, "Search Ads"),
    display_ads: await run(display?.ad_creatives, "Display Ads"),
    video_ads: await run(video?.ad_creatives, "Video Ads"),
  };
}
