import { normalizeDomain } from "./normalize";
import { fetchUpstreamAds } from "./upstream";
import { transformUpstreamPayload } from "./transform";

/**
 * MCP requires a top-level `content` array.
 * This helper guarantees schema validity on every return path.
 */
function mcpText(text: string) {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: any;
  annotations?: {
    readOnlyHint?: boolean;
    openWorldHint?: boolean;
    destructiveHint?: boolean;
  };
};

export type ToolHandler = (args: any) => Promise<any>;

export type ToolRegistry = Record<
  string,
  {
    definition: ToolDefinition;
    run: ToolHandler;
  }
>;

export function registerFairCherTool(): ToolRegistry {
  const definition: ToolDefinition = {
    name: "faircher_domain_ads_summary",
    description:
      "Summarized advertising activity for a domain, including advertisers, formats, and activity.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "A root domain like example.com"
        }
      },
      required: ["domain"],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false
    }
  };

  const run: ToolHandler = async (args: any) => {
    try {
      // 1. Normalize + validate input
      const domain = String(args?.domain || "");
      const normalizedDomain = normalizeDomain(domain);

      // 2. Fetch upstream data (SearchAPI / FairCher backend)
      const upstream = await fetchUpstreamAds({ domain: normalizedDomain });

      // 3. Transform into canonical summary schema
      const data = transformUpstreamPayload(normalizedDomain, upstream);

      // 4. Generate a robust natural-language summary
      let summaryText: string | null = null;

      if (!data?.summary) {
        summaryText =
          `Advertising data was retrieved for ${normalizedDomain}, ` +
          `but could not be summarized due to an unexpected data shape.`;
      } else if (!data.summary.is_running_ads) {
        summaryText =
          `No advertising activity was detected for ${data.domain} ` +
          `in the last 30 days.`;
      } else {
        const advertiserList =
          Array.isArray(data.advertisers) && data.advertisers.length > 0
            ? data.advertisers
                .slice(0, 3)
                .map(a => a.name)
                .join(", ")
            : "unknown advertisers";

        const formats =
          data.distribution?.formats
            ? Object.entries(data.distribution.formats)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")
            : "no format breakdown available";

        summaryText =
          `Advertising activity was found for ${data.domain}.\n\n` +
          `• Total ads detected: ${data.summary.total_ads_found}\n` +
          `• Active advertisers: ${data.summary.active_advertisers}\n` +
          `• Primary advertiser: ${data.summary.primary_advertiser ?? "Unknown"}\n` +
          `• Recent activity: ${data.activity?.is_recent ? "Yes" : "No"}\n` +
          `• Ad formats: ${formats}\n\n` +
          `Top advertisers include: ${advertiserList}.`;
      }

      // 🔒 HARD MCP INVARIANT — NEVER return empty / non-string text
      if (!summaryText || typeof summaryText !== "string") {
        throw new Error("Invariant violation: summaryText must be a non-empty string");
      }

      return {
        content: [
          {
            type: "text",
            text: summaryText
          }
        ],
        structuredContent: data,
        _meta: {
          "openai/outputTemplate": "faircher-ads-summary"
        }
      };
    } catch (err: any) {
      // 5. Defensive error handling — NEVER return raw errors
      return mcpText(
        `Unable to retrieve advertising data for the requested domain. ` +
        `Reason: ${err?.message ?? "Unknown error."}`
      );
    }
  };

  return {
    [definition.name]: {
      definition,
      run
    }
  };
}
