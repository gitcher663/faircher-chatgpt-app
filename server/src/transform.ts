import { differenceInDays, parseISO } from "date-fns";
import type { UpstreamAdsPayload } from "./upstream";

type UpstreamAd = {
  advertiser_name?: string;
  advertiser_id?: string;
  ad_format?: "text" | "image" | "video";
  first_seen?: string;
  last_seen?: string;
};

export function transformUpstreamPayload(
  domain: string,
  upstream: UpstreamAdsPayload
) {
  const ads: UpstreamAd[] = Array.isArray((upstream as any)?.ads)
    ? (upstream as any).ads
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
    const advertiserId = ad.advertiser_id || "unknown";
    const advertiserName = ad.advertiser_name || "Unknown Advertiser";

    if (!advertiserMap.has(advertiserId)) {
      advertiserMap.set(advertiserId, {
        name: advertiserName,
        advertiser_id: advertiserId,
        count: 0,
      });
    }

    advertiserMap.get(advertiserId)!.count += 1;

    if (ad.ad_format && formats[ad.ad_format] !== undefined) {
      formats[ad.ad_format] += 1;
    }

    if (ad.first_seen) firstSeenDates.push(parseISO(ad.first_seen));
    if (ad.last_seen) lastSeenDates.push(parseISO(ad.last_seen));
  }

  const advertisersSorted = Array.from(advertiserMap.values()).sort(
    (a, b) => b.count - a.count
  );

  const primaryAdvertiser = advertisersSorted[0] ?? null;

  const firstSeen =
    firstSeenDates.length > 0
      ? new Date(Math.min(...firstSeenDates.map(d => d.getTime())))
      : null;

  const lastSeen =
    lastSeenDates.length > 0
      ? new Date(Math.max(...lastSeenDates.map(d => d.getTime())))
      : null;

  const lifespanDays =
    firstSeen && lastSeen
      ? differenceInDays(lastSeen, firstSeen)
      : 0;

  const isRecent =
    lastSeen
      ? differenceInDays(new Date(), lastSeen) <= 7
      : false;

  return {
    domain,
    summary: {
      is_running_ads: true,
      total_ads_found: ads.length,
      active_advertisers: advertiserMap.size,
      primary_advertiser: primaryAdvertiser?.name || null,
      confidence: Math.min(1, ads.length / 20),
    },
    activity:
      firstSeen && lastSeen
        ? {
            first_seen: firstSeen.toISOString(),
            last_seen: lastSeen.toISOString(),
            is_recent: isRecent,
            ad_lifespan_days: lifespanDays,
          }
        : null,
    distribution:
      formats.text || formats.image || formats.video
        ? { formats }
        : null,
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
