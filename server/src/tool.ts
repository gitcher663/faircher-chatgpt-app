import { normalizeDomain } from "./normalize";
import { fetchUpstreamAds } from "./upstream";
import { transformUpstreamPayload } from "./transform";
import { buildDomainSummaryText, buildSellerSummary } from "./summary_builder";

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
  securitySchemes?: Array<{ type: string; scopes?: string[] }>;
  annotations?: {
    readOnlyHint?: boolean;
    openWorldHint?: boolean;
    destructiveHint?: boolean;
  };
  _meta?: Record<string, unknown>;
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
      "Summarized advertising activity for a domain with seller-facing spend, behavior, and format insights.",
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
    },
    securitySchemes: [{ type: "noauth" }],
    _meta: {
      securitySchemes: [{ type: "noauth" }],
      "openai/outputTemplate": "ui://faircher/ads-summary.html",
      "openai/widgetAccessible": true,
      "openai/visibility": "public",
      "openai/toolInvocation/invoking": "Analyzing ad activity…",
      "openai/toolInvocation/invoked": "Seller summary ready"
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
      const analysis = transformUpstreamPayload(normalizedDomain, upstream);
      const summary = buildSellerSummary(analysis);

      // 4. Generate a structured FairCher summary
      const summaryText = buildDomainSummaryText(summary);

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
        structuredContent: summary,
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
