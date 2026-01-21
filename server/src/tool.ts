import { Server } from "@modelcontextprotocol/sdk/server";
import { normalizeDomain } from "./normalize.js";
import { fetchUpstreamAds } from "./upstream.js";
import { transformUpstreamPayload } from "./transform.js";

export function registerFairCherTool(server: Server) {
  server.addTool(
    {
      name: "faircher_domain_ads_summary",
      title: "Advertising activity summary",
      description:
        "Summarized advertising activity for a domain, including advertisers, formats, and activity.",
      inputSchema: {
        type: "object",
        properties: {
          domain: {
            type: "string",
          },
        },
        required: ["domain"],
        additionalProperties: false,
      },
      _meta: {
        "openai/outputTemplate": {
          id: "faircher-ads-summary",
          url: "/ui/faircher-ads-summary",
          mimeType: "text/html+skybridge",
        },
      },
    },
    async ({ domain }: { domain: string }) => {
      const normalizedDomain = normalizeDomain(domain);

      const upstream = await fetchUpstreamAds({
        domain: normalizedDomain,
      });

      const data = transformUpstreamPayload(
        normalizedDomain,
        upstream
      );

      return {
        structuredContent: {
          type: "faircherAdsSummary",
          data,
        },
        _meta: {
          "openai/outputTemplate": "faircher-ads-summary",
        },
      };
    }
  );
}
