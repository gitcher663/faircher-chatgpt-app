import { normalizeDomain } from "./normalize";
import { fetchUpstreamAds } from "./upstream";
import { transformLandingPagePayload } from "./transform_landing_page";
import { buildDomainSummaryText, buildSellerSummary } from "./summary_builder";

function mcpText(text: string) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

export function registerFairCherLandingPageTool() {
  const definition = {
    name: "faircher_landing_page_ads_summary",
    description:
      "Summarized advertising activity for ads that link to a given domain, with seller-facing insights.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Landing page domain like midas.com",
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
  };

  const run = async (args: any) => {
    try {
      const domain = normalizeDomain(String(args?.domain || ""));
      const upstream = await fetchUpstreamAds({ domain });

      const analysis = transformLandingPagePayload(domain, upstream);
      const summary = buildSellerSummary(analysis);
      const summaryText = buildDomainSummaryText(summary);

      return {
        content: [
          {
            type: "text",
            text: summaryText,
          },
        ],
        structuredContent: summary,
      };
    } catch (err: any) {
      return mcpText(
        `Unable to retrieve landing-page advertising data. ` +
          `Reason: ${err?.message ?? "Unknown error."}`
      );
    }
  };

  return {
    [definition.name]: {
      definition,
      run,
    },
  };
}
