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

type SearchAd = {
  id?: string;
  advertiser?: {
    id?: string;
    name?: string;
  };
  target_domain?: string;
  details_link?: string;
  first_shown_datetime: string;
  last_shown_datetime: string;
};

function hasDates(ad: { first_shown_datetime?: string; last_shown_datetime?: string }): ad is SearchAd {
  return Boolean(ad.first_shown_datetime && ad.last_shown_datetime);
}

export function transformSearchAds(
  upstream: UpstreamAdsPayload,
  limit = 10
): SearchAdCreative[] {
  const ads = Array.isArray(upstream.ad_creatives)
    ? upstream.ad_creatives.filter(hasDates)
    : [];

  return ads
    .sort(
      (a, b) =>
        new Date(b.last_shown_datetime).getTime() -
        new Date(a.last_shown_datetime).getTime()
    )
    .slice(0, limit)
    .map(ad => ({
      advertiser: ad.advertiser?.name ?? "Unknown Advertiser",
      advertiser_id: ad.advertiser?.id ?? "unknown",
      creative_id: ad.id ?? "unknown",              // CRxxxxxxxxxxxx
      first_seen: ad.first_shown_datetime,
      last_seen: ad.last_shown_datetime,
      details_link: ad.details_link,
      landing_domain: ad.target_domain
    }));
}
