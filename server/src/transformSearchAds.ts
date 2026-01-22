import { parseISO, subDays } from "date-fns";
import type { UpstreamAdsPayload } from "./upstream";

export type SearchAdCreative = {
  first_seen: string;
  last_seen: string;
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

function isWithinWindow(lastSeen: string): boolean {
  const parsed = parseISO(lastSeen);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed >= subDays(new Date(), 365);
}

export function transformSearchAds(
  upstream: UpstreamAdsPayload,
  limit = 10
): SearchAdCreative[] {
  const ads = Array.isArray(upstream.ad_creatives)
    ? upstream.ad_creatives
        .filter(hasDates)
        .filter(ad => isWithinWindow(ad.last_shown_datetime))
    : [];

  return ads
    .sort(
      (a, b) =>
        new Date(b.last_shown_datetime).getTime() -
        new Date(a.last_shown_datetime).getTime()
    )
    .slice(0, limit)
    .map(ad => ({
      first_seen: ad.first_shown_datetime,
      last_seen: ad.last_shown_datetime,
      landing_domain: ad.target_domain
    }));
}
