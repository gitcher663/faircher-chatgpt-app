import type { AdsSummaryResponse, ToolInput } from "./types";
import { normalizeDomain } from "./normalize";
import { fetchUpstreamAds } from "./upstream";
import { transformUpstreamPayload } from "./transform";

export const toolDefinition = {
  name: "faircher_domain_ads_summary",
  description: "Summarize advertising activity for a domain",
  inputSchema: {
    type: "object",
    properties: {
      domain: { type: "string" }
    },
    required: ["domain"]
  }
};

export async function handleTool(
  input: ToolInput
): Promise<AdsSummaryResponse> {
  const domain = normalizeDomain(input.domain);
  const upstream = await fetchUpstreamAds({ domain });

  return transformUpstreamPayload(upstream, domain);
}
