import type { AdsSummaryResponse } from "./types";
import type { UpstreamAdsPayload } from "./upstream";

export function transformUpstreamPayload(
  payload: UpstreamAdsPayload,
  domain: string
): AdsSummaryResponse {
  // TODO: Map upstream fields to AdsSummaryResponse.
  return {
    domain,
    summary: {
      is_running_ads: false,
      total_ads_found: 0,
      active_advertisers: 0,
      primary_advertiser: null,
      confidence: 0
    },
    activity: null,
    distribution: null,
    advertisers: [],
    metadata: {
      data_window: "",
      source: "google_ads_transparency"
    }
  };
}
