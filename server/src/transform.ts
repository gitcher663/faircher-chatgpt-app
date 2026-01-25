import type { UpstreamAdsPayload } from "./upstream";
import { analyzeAds, ANALYSIS_WINDOW } from "./ads_analysis";
import { normalizeAds } from "./normalize.ads";

export function transformUpstreamPayload(
  domain: string,
  upstream: UpstreamAdsPayload
) {
  const ads = normalizeAds({ upstream });
  return {
    ...analyzeAds({ domain, ads }),
    metadata: {
      analysis_window_days: ANALYSIS_WINDOW.days,
      region: ANALYSIS_WINDOW.region,
      source: ANALYSIS_WINDOW.source,
    },
  };
}
