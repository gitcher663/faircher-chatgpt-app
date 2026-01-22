import type { UpstreamAdsPayload } from "./upstream";
import { analyzeAds, ANALYSIS_WINDOW } from "./ads_analysis";

export function transformLandingPagePayload(
  domain: string,
  upstream: UpstreamAdsPayload
) {
  return {
    ...analyzeAds({ domain, upstream, targetDomain: domain }),
    metadata: {
      analysis_window_days: ANALYSIS_WINDOW.days,
      region: ANALYSIS_WINDOW.region,
      source: ANALYSIS_WINDOW.source,
    },
  };
}
