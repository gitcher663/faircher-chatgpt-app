import type { UpstreamAdsPayload } from "./upstream";

export type NormalizedCreative = {
  id: string;
  format: "Search Ads" | "Display Ads" | "Video Ads";
  advertiser_name: string;
  first_seen: string;
  last_seen: string;
  days_active: number;
  creative_url?: string;
  youtube_url?: string;
};

type RawCreative = NonNullable<UpstreamAdsPayload["ad_creatives"]>[number];

type NormalizeCreativesArgs = {
  search?: UpstreamAdsPayload;
  display?: UpstreamAdsPayload;
  video?: UpstreamAdsPayload;
  fetchVideoDetails: (creative: RawCreative) => Promise<unknown>;
};

function normalizeDate(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function computeDaysActive(firstSeen: string, lastSeen: string): number {
  const first = new Date(firstSeen).getTime();
  const last = new Date(lastSeen).getTime();
  if (Number.isNaN(first) || Number.isNaN(last) || last < first) {
    return 0;
  }
  const diffDays = Math.floor((last - first) / (1000 * 60 * 60 * 24));
  return diffDays + 1;
}

function buildCreativeId(
  creative: RawCreative,
  format: NormalizedCreative["format"],
  index: number,
  firstSeen: string
): string {
  return (
    creative.id ??
    `${format}-${creative.advertiser?.name ?? "unknown"}-${firstSeen}-${index}`
  );
}

function normalizeBaseCreative(
  creative: RawCreative,
  format: NormalizedCreative["format"],
  index: number,
  youtubeUrl?: string
): NormalizedCreative | null {
  const firstSeen = normalizeDate(creative.first_shown_datetime);
  const lastSeen = normalizeDate(creative.last_shown_datetime);

  if (!firstSeen || !lastSeen) {
    return null;
  }

  const id = buildCreativeId(creative, format, index, firstSeen);

  const normalized: NormalizedCreative = {
    id,
    format,
    advertiser_name: creative.advertiser?.name ?? "Unknown Advertiser",
    first_seen: firstSeen,
    last_seen: lastSeen,
    days_active: computeDaysActive(firstSeen, lastSeen),
  };

  if (format === "Display Ads") {
    const imageLink = (creative as { image?: { link?: string } }).image?.link;
    if (imageLink) {
      normalized.creative_url = imageLink;
    }
  }

  if (format === "Video Ads" && youtubeUrl) {
    normalized.youtube_url = youtubeUrl;
  }

  return normalized;
}

function extractYouTubeUrl(details: unknown): string | null {
  const root =
    details && typeof details === "object" && "details" in details
      ? (details as { details?: unknown }).details
      : details;

  const candidates = [
    (root as { video?: { youtube_url?: string } })?.video?.youtube_url,
    (root as { video?: { url?: string } })?.video?.url,
    (root as { creative_preview_url?: string })?.creative_preview_url,
  ];

  for (const value of candidates) {
    if (
      typeof value === "string" &&
      (value.includes("youtube.com") || value.includes("youtu.be"))
    ) {
      return value;
    }
  }

  return null;
}

function normalizeStandardCreatives(
  creatives: RawCreative[] | undefined,
  format: NormalizedCreative["format"]
): NormalizedCreative[] {
  if (!creatives) return [];
  const normalized: NormalizedCreative[] = [];
  creatives.forEach((creative, index) => {
    const mapped = normalizeBaseCreative(creative, format, index);
    if (mapped) {
      normalized.push(mapped);
    }
  });
  return normalized;
}

async function normalizeVideoCreatives(
  creatives: RawCreative[] | undefined,
  fetchVideoDetails: (creative: RawCreative) => Promise<unknown>
): Promise<NormalizedCreative[]> {
  if (!creatives) return [];
  const normalized: NormalizedCreative[] = [];

  for (const [index, creative] of creatives.entries()) {
    if (!creative.details_link) {
      continue;
    }

    const details = await fetchVideoDetails(creative);
    const youtubeUrl = extractYouTubeUrl(details);
    if (!youtubeUrl) {
      continue;
    }

    const mapped = normalizeBaseCreative(
      creative,
      "Video Ads",
      index,
      youtubeUrl
    );
    if (mapped) {
      normalized.push(mapped);
    }
  }

  return normalized;
}

export async function normalizeCreatives({
  search,
  display,
  video,
  fetchVideoDetails,
}: NormalizeCreativesArgs): Promise<{
  search_ads: NormalizedCreative[];
  display_ads: NormalizedCreative[];
  video_ads: NormalizedCreative[];
}> {
  const searchAds = normalizeStandardCreatives(
    search?.ad_creatives,
    "Search Ads"
  );
  const displayAds = normalizeStandardCreatives(
    display?.ad_creatives,
    "Display Ads"
  );
  const videoAds = await normalizeVideoCreatives(
    video?.ad_creatives,
    fetchVideoDetails
  );

  return {
    search_ads: searchAds,
    display_ads: displayAds,
    video_ads: videoAds,
  };
}
