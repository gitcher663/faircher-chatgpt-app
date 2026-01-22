import type {
  AdsByFormatEnrichedResponse,
  AdsByFormatResponse,
} from "./transform_ads_by_format";

export async function enrichAdsByFormatWithDetails(
  data: AdsByFormatResponse
): Promise<AdsByFormatEnrichedResponse> {
  return data;
}
