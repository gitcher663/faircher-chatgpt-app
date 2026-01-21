import type { UpstreamAdsPayload } from "./upstream";
import type { AdFormat } from "./fetchAdsByFormat";

export type AdsByFormatCreative = {
  advertiser_id: string | null;
  advertiser_name: string | null;
  creative_id: string | null;
  format: AdFormat | null;
  target_domain: string | null;
  first_shown_datetime: string | null;
  last_shown_datetime: string | null;
  details_link: string | null;
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

function toSortableDate(date?: string): number {
  const parsed = date ? Date.parse(date) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
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
          format: ad.format ?? adFormat,
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
