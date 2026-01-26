import { normalizeDomain } from "./normalize";
import { ValidationError } from "./errors";
import { fetchAllPages } from "./upstream";
import { analyzeAds } from "./ads_analysis";
import { normalizeAds } from "./normalize_ads";
import { buildSellerSummary } from "./summary_builder";

/* ============================================================================
   Tool Types
   ============================================================================ */

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolRuntime = {
  definition: ToolDefinition;
  run: (args: any) => Promise<any>;
};

export type ToolRegistry = Record<string, ToolRuntime>;

type ToolErrorCode = "invalid_domain" | "upstream_error";

type ToolError = {
  error: {
    code: ToolErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};

/* ============================================================================
   Constants
   ============================================================================ */

const DEFAULT_LOOKBACK_DAYS = 365;
const SEARCH_API_BASE = "https://www.searchapi.io/api/v1/search";

/* ============================================================================
   Time helpers
   ============================================================================ */

function computeTimePeriod(lookbackDays: number): string {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - lookbackDays);

  return `${from.toISOString().slice(0, 10)}..${to
    .toISOString()
    .slice(0, 10)}`;
}

/* ============================================================================
   Upstream fetchers (SearchAPI ONLY)
   ============================================================================ */

async function fetchDisplayAds(domain: string, timePeriod: string) {
  return fetchAllPages(SEARCH_API_BASE, {
    engine: "google_ads_transparency_center",
    domain,
    ad_format: "image",
    num: 100,
    time_period: timePeriod,
  });
}

async function fetchSearchAds(domain: string, timePeriod: string) {
  return fetchAllPages(SEARCH_API_BASE, {
    engine: "google_ads_transparency_center",
    domain,
    ad_format: "text",
    num: 100,
    time_period: timePeriod,
  });
}

async function fetchYouTubeAds(domain: string, timePeriod: string) {
  return fetchAllPages(SEARCH_API_BASE, {
    engine: "google_ads_transparency_center",
    domain,
    platform: "youtube",
    ad_format: "video",
    num: 100,
    time_period: timePeriod,
  });
}

async function fetchNonYouTubeVideoAds(domain: string, timePeriod: string) {
  return fetchAllPages(SEARCH_API_BASE, {
    engine: "google_ads_transparency_center",
    domain,
    ad_format: "video",
    num: 100,
    time_period: timePeriod,
  });
}

/* ============================================================================
   Tool Registration
   ============================================================================ */

export function registerFairCherTool(): ToolRegistry {
  return {
    faircher_domain_ads_summary: {
      definition: {
        name: "faircher_domain_ads_summary",
        description:
          "Returns consolidated advertising intelligence for a domain using Google Ads Transparency Center data.",
        inputSchema: {
          type: "object",
          required: ["domain"],
          properties: {
            domain: {
              type: "string",
              description: "Apex domain (e.g. example.com)",
            },
          },
        },
      },

      async run(args: { domain: string }) {
        try {
          if (
            !args ||
            typeof args.domain !== "string" ||
            args.domain.trim().length === 0
          ) {
            return wrapText(
              buildToolError(
                "invalid_domain",
                "Domain must be a valid apex domain.",
                { domain: args?.domain }
              )
            );
          }

          const domain = normalizeDomain(args.domain);
          const timePeriod = computeTimePeriod(DEFAULT_LOOKBACK_DAYS);

          const [
            displayAds,
            searchAds,
            youtubeAds,
            videoAdsRaw,
          ] = await Promise.all([
            fetchDisplayAds(domain, timePeriod),
            fetchSearchAds(domain, timePeriod),
            fetchYouTubeAds(domain, timePeriod),
            fetchNonYouTubeVideoAds(domain, timePeriod),
          ]);

          const ads = [
            ...displayAds.flatMap(u => normalizeAds({ upstream: u })),
            ...searchAds.flatMap(u => normalizeAds({ upstream: u })),
            ...youtubeAds.flatMap(u => normalizeAds({ upstream: u })),
            ...videoAdsRaw.flatMap(u => normalizeAds({ upstream: u })),
          ];

          const analysis = analyzeAds({
            domain,
            ads,
            infrastructure: null,
          });

          return wrapText(buildSellerSummary(analysis));
        } catch (error) {
          if (error instanceof ValidationError) {
            return wrapText(
              buildToolError(
                "invalid_domain",
                "Domain must be a valid apex domain.",
                { domain: args?.domain }
              )
            );
          }

          return wrapText(
            buildToolError("upstream_error", "Upstream ads service unavailable.", {
              cause:
                error instanceof Error ? error.message : "Unknown error",
              retryable: true,
            })
          );
        }
      },
    },
  };
}

/* ============================================================================
   Output helpers (VALID ChatGPT schema)
   ============================================================================ */

function wrapText(payload: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function buildToolError(
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>
): ToolError {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
