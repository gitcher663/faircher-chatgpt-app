import { normalizeDomain } from "./normalize";
import { fetchUpstreamAds } from "./upstream";
import { transformUpstreamPayload } from "./transform";

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
    const domain = String(args?.domain || "");
    const normalizedDomain = normalizeDomain(domain);

    const upstream = await fetchUpstreamAds({ domain: normalizedDomain });
    const data = transformUpstreamPayload(normalizedDomain, upstream);

    return {
      structuredContent: {
        type: "faircherAdsSummary",
        data
      },
      _meta: {
        "openai/outputTemplate": "faircher-ads-summary"
      }
    };
  };

  return {
    [definition.name]: {
      definition,
      run
    }
  };
}
