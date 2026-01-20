import type { ToolInput } from "./types";

export interface UpstreamAdsPayload {
  // TODO: Replace with upstream schema fields.
  raw: unknown;
}

export async function fetchUpstreamAds(
  input: ToolInput
): Promise<UpstreamAdsPayload> {
  // TODO: Implement Google Ads Transparency API client.
  return {
    raw: {
      domain: input.domain
    }
  };
}
