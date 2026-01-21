import { normalizeDomain } from "./normalize";
import { fetchUpstreamAds } from "./upstream";
import { transformLandingPagePayload } from "./transform_landing_page";

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
      "Summarized advertising activity for ads that link to a given domain, regardless of advertiser of record.",
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

      const data = transformLandingPagePayload(domain, upstream);

      const summaryText =
        `Advertising activity was detected linking to ${domain}.\n\n` +
        `• Total ads detected: ${data.summary.total_ads_found}\n` +
        `• Active advertisers: ${data.summary.active_advertisers}\n` +
        `• Primary advertiser: ${data.summary.primary_advertiser}\n` +
        `• Recent activity: ${data.activity?.is_recent ? "Yes" : "No"}\n\n` +
        `Top advertisers include: ${data.advertisers
          .slice(0, 3)
          .map(a => a.name)
          .join(", ")}.`;

      return {
        content: [
          {
            type: "text",
            text: summaryText,
          },
        ],
        structuredContent: data,
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
