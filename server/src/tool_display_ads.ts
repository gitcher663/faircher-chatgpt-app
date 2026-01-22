import { normalizeDomain } from "./normalize";
import { fetchUpstreamAds } from "./upstream";
import { transformUpstreamPayload } from "./transform";
import { buildFormatSummaryData, buildFormatSummaryText } from "./summary_builder";

function buildErrorResult(domain: string | null, message: string) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: {
      format: "Display Ads",
      analysis_window_days: 365,
      region: "US",
      total_ads_detected: 0,
      share_of_total_activity: 0,
      activity_pattern: "Burst-driven",
      sales_signal_strength: "Weak",
      error: message,
    },
  };
}

export function registerFairCherDisplayAdsTool() {
  const definition = {
    name: "faircher_display_ads",
    description:
      "Retrieve Google Display Ads signals for a domain and summarize seller-facing activity.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Advertiser domain (e.g. tesla.com)",
        },
      },
      required: ["domain"],
      additionalProperties: false,
    },
  };

  const run = async (args: any) => {
    const rawDomain = typeof args?.domain === "string" ? args.domain : "";

    try {
      const domain = normalizeDomain(rawDomain);
      const upstream = await fetchUpstreamAds({ domain });
      const analysis = transformUpstreamPayload(domain, upstream);
      const summary = buildFormatSummaryData(analysis, "Display Ads");
      const summaryText = buildFormatSummaryText(domain, summary);

      return {
        content: [{ type: "text", text: summaryText }],
        structuredContent: summary,
      };
    } catch (err: any) {
      const message =
        `Unable to retrieve display ads. ` +
        `Reason: ${err?.message ?? "Unknown error"}`;
      return buildErrorResult(rawDomain, message);
    }
  };

  return {
    [definition.name]: { definition, run },
  };
}
