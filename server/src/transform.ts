import { differenceInDays, parseISO } from "date-fns";
import type { UpstreamAdsPayload } from "./upstream";

type UpstreamAd = {
  advertiser_name: string;
  advertiser_id: string;
  ad_format: "text" | "image" | "video";
  first_seen: string;
  last_seen: string;
};

export function transformUpstreamPayload(
  domain: string,
  upstream: UpstreamAdsPayload
) {
  // 🔴 FIX: Read the correct field from SearchAPI
  const ads: UpstreamAd[] = Array.isArray(upstream.ad_creatives)
    ? upstream.ad_creatives.map(ad => ({
        advertiser_name: ad.advertiser?.name ?? "Unknown Advertiser",
        advertiser_id: ad.advertiser?.id ?? "unknown",
        ad_format: ad.format,
        first_seen: ad.first_shown_datetime,
        last_seen: ad.last_shown_datetime,
      }))
    : [];

  // Early exit — no ads
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

  const advertiserMap = new Map<
    string,
    { name: string; advertiser_id: string; count: number }
  >();

  const formats: Record<"text" | "image" | "video", number> = {
    text: 0,
    image: 0,
    video: 0,
  };

  const firstSeenDates: Date[] = [];
  const lastSeenDates: Date[] = [];

  for (const ad of ads) {
    if (!advertiserMap.has(ad.advertiser_id)) {
      advertiserMap.set(ad.advertiser_id, {
        name: ad.advertiser_name,
        advertiser_id: ad.advertiser_id,
        count: 0,
      });
    }

    advertiserMap.get(ad.advertiser_id)!.count += 1;
    formats[ad.ad_format] += 1;

    firstSeenDates.push(parseISO(ad.first_seen));
    lastSeenDates.push(parseISO(ad.last_seen));
  }

  const advertisersSorted = Array.from(advertiserMap.values()).sort(
    (a, b) => b.count - a.count
  );

  const primaryAdvertiser = advertisersSorted[0] ?? null;

  const firstSeen = new Date(
    Math.min(...firstSeenDates.map(d => d.getTime()))
  );

  const lastSeen = new Date(
    Math.max(...lastSeenDates.map(d => d.getTime()))
  );

  const lifespanDays = differenceInDays(lastSeen, firstSeen);
  const isRecent = differenceInDays(new Date(), lastSeen) <= 7;

  return {
    domain,
    summary: {
      is_running_ads: true,
      total_ads_found: ads.length,
      active_advertisers: advertiserMap.size,
      primary_advertiser: primaryAdvertiser?.name || null,
      confidence: Math.min(1, ads.length / 20),
    },
    activity: {
      first_seen: firstSeen.toISOString(),
      last_seen: lastSeen.toISOString(),
      is_recent: isRecent,
      ad_lifespan_days: lifespanDays,
    },
    distribution: {
      formats,
    },
    advertisers: advertisersSorted.map(a => ({
      name: a.name,
      advertiser_id: a.advertiser_id,
      ad_count_estimate: a.count,
      is_primary: a.advertiser_id === primaryAdvertiser?.advertiser_id,
    })),
    metadata: {
      data_window: "last_30_days",
      source: "google_ads_transparency_center",
    },
  };
}
