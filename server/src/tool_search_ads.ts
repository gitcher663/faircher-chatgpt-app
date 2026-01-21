import { normalizeDomain } from "./normalize";
import { fetchSearchAds } from "./fetchSearchAds";
import { transformSearchAds } from "./transformSearchAds";

function mcpText(text: string) {
  return {
    content: [{ type: "text", text }]
  };
}

export function registerFairCherSearchAdsTool() {
  const definition = {
    name: "faircher_search_ads",
    description:
      "Retrieve recent Google Search Ads (text ads) for an advertiser or domain, including creative examples.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Advertiser domain (e.g. tesla.com)"
        }
      },
      required: ["domain"],
      additionalProperties: false
    }
  };

  const run = async (args: any) => {
    try {
      const domain = normalizeDomain(String(args.domain));
      const upstream = await fetchSearchAds({ domain });
      const creatives = transformSearchAds(upstream, 10);

      if (creatives.length === 0) {
        return mcpText(`No recent search ads were found for ${domain}.`);
      }

      const summary =
        `Found ${creatives.length} recent Google Search Ads for ${domain}.\n\n` +
        creatives
          .map(
            (c, i) =>
              `${i + 1}. ${c.advertiser}\n` +
              `   Creative ID: ${c.creative_id}\n` +
              `   Last seen: ${c.last_seen}\n` +
              (c.landing_domain
                ? `   Landing page: ${c.landing_domain}\n`
                : "")
          )
          .join("\n");

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: {
          domain,
          creatives
        }
      };
    } catch (err: any) {
      return mcpText(
        `Unable to retrieve search ads. Reason: ${err?.message ?? "Unknown error"}`
      );
    }
  };

  return {
    [definition.name]: { definition, run }
  };
}
