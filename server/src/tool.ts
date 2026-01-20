import { McpServer } from "@modelcontextprotocol/sdk/server";
import type { AdsSummaryResponse } from "./types";
import { normalizeDomain } from "./normalize";
import { fetchUpstreamAds } from "./upstream";
import { transformUpstreamPayload } from "./transform";

/**
 * Registers the FairCher Ads Summary tool with the MCP server.
 * This is what makes ChatGPT aware the tool exists.
 */
export function registerFairCherTool(server: McpServer) {
  server.registerTool(
    "faircher_domain_ads_summary",
    {
      title: "Advertising activity summary",
      description:
        "Use this when you want a summarized view of advertising activity for a company or domain, including ad presence, advertisers, and ad formats.",
      inputSchema: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            description:
              "A root domain like example.com. URLs and subdomains will be normalized or rejected.",
          },
        },
        required: ["domain"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
      _meta: {
        "openai/outputTemplate": {
          id: "faircher-ads-summary",
          url: "/ui/faircher-ads-summary",
          mimeType: "text/html+skybridge",
        },
        "openai/toolInvocation/invoking":
          "Analyzing advertising activity…",
        "openai/toolInvocation/invoked":
          "Advertising activity analyzed.",
      },
    },
    async ({ domain }): Promise<AdsSummaryResponse> => {
      const normalizedDomain = normalizeDomain(domain);
      const upstreamPayload = await fetchUpstreamAds({
        domain: normalizedDomain,
      });

      return {
        structuredContent: {
          type: "faircherAdsSummary",
          data: transformUpstreamPayload(
            upstreamPayload,
            normalizedDomain
          ),
        },
        _meta: {
          "openai/outputTemplate": "faircher-ads-summary",
        },
      };
    }
  );
}
