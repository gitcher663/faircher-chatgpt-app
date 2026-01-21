import type { UpstreamAdsPayload } from "./upstream";

export type SearchAdCreative = {
  advertiser: string;
  advertiser_id: string;
  creative_id: string;
  first_seen: string;
  last_seen: string;
  details_link?: string;
  landing_domain?: string;
};

export function transformSearchAds(
  upstream: UpstreamAdsPayload,
  limit = 10
): SearchAdCreative[] {
  if (!Array.isArray(upstream.ad_creatives)) return [];

  return upstream.ad_creatives
    .sort(
      (a, b) =>
        new Date(b.last_shown_datetime).getTime() -
        new Date(a.last_shown_datetime).getTime()
    )
    .slice(0, limit)
    .map(ad => ({
      advertiser: ad.advertiser.name,
      advertiser_id: ad.advertiser.id,
      creative_id: ad.id,              // CRxxxxxxxxxxxx
      first_seen: ad.first_shown_datetime,
      last_seen: ad.last_shown_datetime,
      details_link: ad.details_link,
      landing_domain: ad.target_domain
    }));
}
