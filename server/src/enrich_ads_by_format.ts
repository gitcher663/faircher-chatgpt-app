import { fetchAdDetails } from "./fetchaddetails";
import type { AdDetailsResponse } from "./fetchaddetails";
import {
  AdsByFormatEnrichedResponse,
  AdsByFormatResponse,
  buildAdDetailsKey,
  mergeCreativesWithDetails,
} from "./transform_ads_by_format";

export async function enrichAdsByFormatWithDetails(
  data: AdsByFormatResponse
): Promise<AdsByFormatEnrichedResponse> {
  const detailEntries = await Promise.all(
    data.creatives.map(async creative => {
      const key = buildAdDetailsKey(
        creative.advertiser_id,
        creative.creative_id
      );

      if (!key) {
        return null;
      }

      try {
        const details = await fetchAdDetails({
          advertiserId: creative.advertiser_id ?? "",
          creativeId: creative.creative_id ?? "",
        });
        return { key, details };
      } catch {
        return { key, details: null };
      }
    })
  );

  const detailsByKey = new Map<string, AdDetailsResponse | null>();

  detailEntries.forEach(entry => {
    if (entry) {
      detailsByKey.set(entry.key, entry.details);
    }
  });

  const creatives = mergeCreativesWithDetails(data.creatives, detailsByKey);

  return {
    ...data,
    creatives,
  };
}
