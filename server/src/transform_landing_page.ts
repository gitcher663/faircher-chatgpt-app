import { differenceInDays, parseISO } from "date-fns";
import type { UpstreamAdsPayload } from "./upstream";

type LandingAd = {
  advertiser?: {
    name?: string;
  };
  format: "text" | "image" | "video";
  target_domain?: string;
  first_shown_datetime: string;
  last_shown_datetime: string;
};

function isLandingAd(ad: {
  format?: "text" | "image" | "video";
  target_domain?: string;
  first_shown_datetime?: string;
  last_shown_datetime?: string;
}): ad is LandingAd {
  return Boolean(
    ad.format &&
      ad.first_shown_datetime &&
      ad.last_shown_datetime
  );
}

export function transformLandingPagePayload(
  domain: string,
  upstream: UpstreamAdsPayload
) {
  const ads = (upstream.ad_creatives ?? [])
    .filter(isLandingAd)
    .filter(ad => ad.target_domain === domain);

  if (ads.length === 0) {
    return {
      domain,
      summary: {
        is_running_ads: false,
        total_ads_found: 0,
        active_advertisers: 0,
        primary_advertiser: null,
        confidence: 0,
      },
      activity: null,
      distribution: null,
      advertisers: [],
      metadata: {
        data_window: "last_30_days",
        source: "google_ads_transparency_center",
      },
    };
  }

  const advertiserMap = new Map<string, number>();
  const formats = { text: 0, image: 0, video: 0 };
  const firstSeen: Date[] = [];
  const lastSeen: Date[] = [];

  for (const ad of ads) {
    const advertiserName = ad.advertiser?.name ?? "Unknown Advertiser";

    advertiserMap.set(
      advertiserName,
      (advertiserMap.get(advertiserName) ?? 0) + 1
    );

    formats[ad.format] += 1;
    firstSeen.push(parseISO(ad.first_shown_datetime));
    lastSeen.push(parseISO(ad.last_shown_datetime));
  }

  const advertisers = Array.from(advertiserMap.entries())
    .map(([name, count]) => ({
      name,
      advertiser_id: "unknown",
      ad_count_estimate: count,
      is_primary: false,
    }))
    .sort((a, b) => b.ad_count_estimate - a.ad_count_estimate);

  if (advertisers[0]) {
    advertisers[0].is_primary = true;
  }

  const first = new Date(Math.min(...firstSeen.map(d => d.getTime())));
  const last = new Date(Math.max(...lastSeen.map(d => d.getTime())));

  return {
    domain,
    summary: {
      is_running_ads: true,
      total_ads_found: ads.length,
      active_advertisers: advertiserMap.size,
      primary_advertiser: advertisers[0].name,
      confidence: Math.min(1, ads.length / 20),
    },
    activity: {
      first_seen: first.toISOString(),
      last_seen: last.toISOString(),
      is_recent: differenceInDays(new Date(), last) <= 7,
      ad_lifespan_days: differenceInDays(last, first),
    },
    distribution: { formats },
    advertisers,
    metadata: {
      data_window: "last_30_days",
      source: "google_ads_transparency_center",
    },
  };
}
