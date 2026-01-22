import type { UpstreamAdsPayload } from "./upstream";
import { normalizeDomain } from "./normalize";
import { normalizeTimePeriod } from "./time_period";

const SEARCH_API_URL = "https://www.searchapi.io/api/v1/search";

type FetchSearchAdsArgs = {
  domain?: string;
  advertiserId?: string;
};

export async function fetchSearchAds(
  args: FetchSearchAdsArgs
): Promise<UpstreamAdsPayload> {
  const apiKey = process.env.UPSTREAM_API_KEY;
  if (!apiKey) throw new Error("Missing UPSTREAM_API_KEY");

  if (!args.domain && !args.advertiserId) {
    throw new Error("Either domain or advertiserId is required");
  }

  const params = new URLSearchParams({
    engine: "google_ads_transparency_center",
    region: "US",
    time_period: normalizeTimePeriod("last_365_days"),
    ad_format: "text",          // 🔒 THIS is the key: SEARCH ADS ONLY
    num: "100"
  });

  if (args.domain) params.set("domain", normalizeDomain(args.domain));
  if (args.advertiserId) params.set("advertiser_id", args.advertiserId);

  const response = await fetch(`${SEARCH_API_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Search ads fetch failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as UpstreamAdsPayload;
  json.ad_creatives ??= [];
  return json;
}
