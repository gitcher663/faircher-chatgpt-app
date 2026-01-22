import { normalizeDomain } from "./normalize";
import { fetchAdsByFormat } from "./fetchAdsByFormat";
import { transformAdsByFormat } from "./transform_ads_by_format";
import { enrichAdsByFormatWithDetails } from "./enrich_ads_by_format";
import { buildFormatSummary } from "./summary_builder";

function buildErrorResult(domain: string | null, message: string) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: {
      domain: domain ?? "",
      ad_format: "text",
      total_creatives: 0,
      creatives: [],
      metadata: {
        source: "google_ads_transparency_center",
        time_window: "last_30_days",
      },
      error: message,
    },
  };
}

export function registerFairCherSearchAdsTool() {
  const definition = {
    name: "faircher_search_ads",
    description:
      "Retrieve recent Google Search Ads (text ads) for a domain, including creative examples.",
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
      const upstream = await fetchAdsByFormat({ domain, adFormat: "text" });
      const data = transformAdsByFormat(domain, "text", upstream, 10);
      const enriched = await enrichAdsByFormatWithDetails(data);

      const summaryText = buildFormatSummary(enriched);

      return {
        content: [{ type: "text", text: summaryText }],
        structuredContent: enriched,
      };
    } catch (err: any) {
      const message =
        `Unable to retrieve search ads. ` +
        `Reason: ${err?.message ?? "Unknown error"}`;
      return buildErrorResult(rawDomain, message);
    }
  };

  return {
    [definition.name]: { definition, run },
  };
}
