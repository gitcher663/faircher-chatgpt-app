import type { UpstreamAdsPayload } from "./upstream";
import type { AdFormat } from "./fetchAdsByFormat";
import type { AdDetailsResponse, AdRegion, AdVariation } from "./fetchaddetails";

export type AdsByFormatCreative = {
  advertiser_id: string | null;
  advertiser_name: string | null;
  creative_id: string | null;
  ad_format: AdFormat | null;
  platform: "youtube" | null;
  duration: number | null;
  target_domain: string | null;
  first_shown_datetime: string | null;
  last_shown_datetime: string | null;
  details_link: string | null;
};

export type NormalizedAdRegion = {
  code: string | null;
  name: string | null;
  first_shown_date: string | null;
  last_shown_date: string | null;
};

export type NormalizedAdVariation = {
  title: string | null;
  snippet: string | null;
  displayed_link: string | null;
  link: string | null;
  image: string | null;
  images: string[] | null;
  video_id: string | null;
  video_link: string | null;
  duration: string | null;
  channel: string | null;
  is_skippable: boolean | null;
  domain: string | null;
  call_to_action: string | null;
};

export type NormalizedAdDetails = {
  ad_information: {
    format: AdFormat | null;
    topic: string | null;
    first_shown_date: string | null;
    last_shown_date: string | null;
    last_shown_datetime: string | null;
    audience_selection: string[] | null;
    regions: NormalizedAdRegion[] | null;
  } | null;
  variations: NormalizedAdVariation[] | null;
};

export type AdsByFormatEnrichedCreative = AdsByFormatCreative & {
  topic: string | null;
  regions: NormalizedAdRegion[] | null;
  audience_selection: string[] | null;
  variations: NormalizedAdVariation[] | null;
  ad_details: NormalizedAdDetails | null;
};

export type AdsByFormatResponse = {
  domain: string;
  ad_format: AdFormat;
  total_creatives: number;
  creatives: AdsByFormatCreative[];
  metadata: {
    source: "google_ads_transparency_center";
    time_window: "last_30_days";
  };
};

export type AdsByFormatEnrichedResponse = Omit<
  AdsByFormatResponse,
  "creatives"
> & {
  creatives: AdsByFormatEnrichedCreative[];
};

function toSortableDate(date?: string): number {
  const parsed = date ? Date.parse(date) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeAdRegion(region: AdRegion): NormalizedAdRegion {
  return {
    code: region.code ?? null,
    name: region.name ?? null,
    first_shown_date: region.first_shown_date ?? null,
    last_shown_date: region.last_shown_date ?? null,
  };
}

function normalizeAdVariation(variation: AdVariation): NormalizedAdVariation {
  return {
    title: variation.title ?? null,
    snippet: variation.snippet ?? null,
    displayed_link: variation.displayed_link ?? null,
    link: variation.link ?? null,
    image: variation.image ?? null,
    images: Array.isArray(variation.images) ? variation.images : null,
    video_id: variation.video_id ?? null,
    video_link: variation.video_link ?? null,
    duration: variation.duration ?? null,
    channel: variation.channel ?? null,
    is_skippable:
      typeof variation.is_skippable === "boolean"
        ? variation.is_skippable
        : null,
    domain: variation.domain ?? null,
    call_to_action: variation.call_to_action ?? null,
  };
}

function parseDurationSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parts = value.split(":").map(part => Number(part));
  if (parts.some(part => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

function findDurationSeconds(
  variations: NormalizedAdVariation[] | null
): number | null {
  if (!variations) {
    return null;
  }

  for (const variation of variations) {
    const seconds = parseDurationSeconds(variation.duration);
    if (seconds !== null) {
      return seconds;
    }
  }

  return null;
}

function detectPlatform(
  variations: NormalizedAdVariation[] | null
): "youtube" | null {
  if (!variations) {
    return null;
  }

  for (const variation of variations) {
    const link = variation.video_link ?? "";
    if (link.includes("youtube.com") || link.includes("youtu.be")) {
      return "youtube";
    }
  }

  return null;
}

export function normalizeAdDetails(
  details: AdDetailsResponse | null
): NormalizedAdDetails | null {
  if (!details) {
    return null;
  }

  const adInformation = details.ad_information;
  const regions = Array.isArray(adInformation?.regions)
    ? adInformation?.regions.map(normalizeAdRegion)
    : null;
  const variations = Array.isArray(details.variations)
    ? details.variations.map(normalizeAdVariation)
    : null;

  return {
    ad_information: adInformation
      ? {
          format: adInformation.format ?? null,
          topic: adInformation.topic ?? null,
          first_shown_date: adInformation.first_shown_date ?? null,
          last_shown_date: adInformation.last_shown_date ?? null,
          last_shown_datetime: adInformation.last_shown_datetime ?? null,
          audience_selection: Array.isArray(adInformation.audience_selection)
            ? adInformation.audience_selection
            : null,
          regions,
        }
      : null,
    variations,
  };
}

export function buildAdDetailsKey(
  advertiserId: string | null,
  creativeId: string | null
): string | null {
  if (!advertiserId || !creativeId) {
    return null;
  }

  return `${advertiserId}:${creativeId}`;
}

export function mergeCreativesWithDetails(
  creatives: AdsByFormatCreative[],
  detailsByKey: Map<string, AdDetailsResponse | null>
): AdsByFormatEnrichedCreative[] {
  return creatives.map(creative => {
    const key = buildAdDetailsKey(
      creative.advertiser_id,
      creative.creative_id
    );
    const details = key ? detailsByKey.get(key) ?? null : null;
    const normalized = normalizeAdDetails(details);
    const adInformation = normalized?.ad_information ?? null;
    const variations = normalized?.variations ?? null;
    const duration = findDurationSeconds(variations);
    const platform = detectPlatform(variations);

    return {
      ...creative,
      topic: adInformation?.topic ?? null,
      regions: adInformation?.regions ?? null,
      audience_selection: adInformation?.audience_selection ?? null,
      variations,
      ad_details: normalized,
      duration,
      platform,
    };
  });
}

export function transformAdsByFormat(
  domain: string,
  adFormat: AdFormat,
  upstream: UpstreamAdsPayload,
  limit = 10
): AdsByFormatResponse {
  const creatives = Array.isArray(upstream.ad_creatives)
    ? [...upstream.ad_creatives]
        .sort(
          (a, b) =>
            toSortableDate(b.last_shown_datetime) -
            toSortableDate(a.last_shown_datetime)
        )
        .slice(0, limit)
        .map(ad => ({
          advertiser_id: ad.advertiser?.id ?? null,
          advertiser_name: ad.advertiser?.name ?? null,
          creative_id: ad.id ?? null,
          ad_format: ad.format ?? adFormat,
          platform: null,
          duration: null,
          target_domain: ad.target_domain ?? null,
          first_shown_datetime: ad.first_shown_datetime ?? null,
          last_shown_datetime: ad.last_shown_datetime ?? null,
          details_link: ad.details_link ?? null,
        }))
    : [];

  return {
    domain,
    ad_format: adFormat,
    total_creatives: creatives.length,
    creatives,
    metadata: {
      source: "google_ads_transparency_center",
      time_window: "last_30_days",
    },
  };
}
