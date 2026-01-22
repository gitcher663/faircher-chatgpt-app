import type { UpstreamAdsPayload } from "./upstream";
import type { AdFormat } from "./fetchAdsByFormat";
import { analyzeAds, normalizeFormat } from "./ads_analysis";
import type { FormatSpecificSummary } from "./summary_builder";
import { buildFormatSummaryData } from "./summary_builder";

export type AdsByFormatResponse = FormatSpecificSummary;
export type AdsByFormatEnrichedResponse = FormatSpecificSummary;

export function transformAdsByFormat(
  domain: string,
  adFormat: AdFormat,
  upstream: UpstreamAdsPayload
): AdsByFormatResponse {
  const analysis = analyzeAds({ domain, upstream });
  const canonicalFormat = normalizeFormat(adFormat);
  return buildFormatSummaryData(analysis, canonicalFormat);
}
