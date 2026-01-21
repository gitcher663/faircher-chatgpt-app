import { normalizeDomain } from "./normalize";
import { fetchAdsByFormat } from "./fetchAdsByFormat";
import { transformAdsByFormat } from "./transform_ads_by_format";
import { enrichAdsByFormatWithDetails } from "./enrich_ads_by_format";

function buildErrorResult(domain: string | null, message: string) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: {
      domain: domain ?? "",
      ad_format: "video",
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

export function registerFairCherStreamingAdsTool() {
  const definition = {
    name: "faircher_streaming_ads",
    description:
      "Retrieve recent Google Streaming Ads (video ads) for a domain, including creative examples.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Advertiser domain (e.g. tesla.com)",
        },
        platform: {
          type: "string",
          enum: ["youtube"],
          description: "Filter streaming ads by platform (e.g. youtube).",
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
      const platform =
        typeof args?.platform === "string" ? args.platform : undefined;
      if (platform && platform !== "youtube") {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      const upstream = await fetchAdsByFormat({ domain, adFormat: "video" });
      const data = transformAdsByFormat(domain, "video", upstream, 10);
      const enriched = await enrichAdsByFormatWithDetails(data);
      const creatives =
        platform === "youtube"
          ? enriched.creatives.filter(creative => creative.platform === "youtube")
          : enriched.creatives;
      const filtered = {
        ...enriched,
        total_creatives: creatives.length,
        creatives,
      };

      const summaryText =
        filtered.total_creatives === 0
          ? `No recent streaming ads were found for ${domain} in the last 30 days.`
          : `Found ${filtered.total_creatives} recent streaming ads for ${domain} in the last 30 days.`;

      return {
        content: [{ type: "text", text: summaryText }],
        structuredContent: filtered,
      };
    } catch (err: any) {
      const message =
        `Unable to retrieve streaming ads. ` +
        `Reason: ${err?.message ?? "Unknown error"}`;
      return buildErrorResult(rawDomain, message);
    }
  };

  return {
    [definition.name]: { definition, run },
  };
}
