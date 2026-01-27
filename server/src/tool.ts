import { normalizeDomain } from "./normalize";
import { ValidationError } from "./errors";
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

/**
 * Snapshot semantics:
 * - Short lookback
 * - Capped creative count
 * - No pagination
 * - Qualification only
 */
const SNAPSHOT_LOOKBACK_DAYS = 120;
const MAX_ADS_PER_FORMAT = 40;

const SEARCH_API_BASE = "https://www.searchapi.io/api/v1/search";

/* ============================================================================
   Time helpers
   ============================================================================ */

function computeTimePeriod(days: number): string {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);

  return `${from.toISOString().slice(0, 10)}..${to
    .toISOString()
    .slice(0, 10)}`;
}

/* ============================================================================
   Fetch helpers
   ============================================================================ */

function getFetch(): typeof fetch {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("Fetch API unavailable in this runtime.");
  }
  return globalThis.fetch;
}

async function fetchOnce(params: Record<string, any>) {
  const url = new URL(SEARCH_API_BASE);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const res = await getFetch()(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Upstream error (${res.status})`);
  }

  return res.json();
}

/* ============================================================================
   Snapshot fetchers (NO pagination)
   ============================================================================ */

async function fetchSearchAds(domain: string, timePeriod: string) {
  return fetchOnce({
    engine: "google_ads_transparency_center",
    domain,
    ad_format: "text",
    num: MAX_ADS_PER_FORMAT,
    time_period: timePeriod,
  });
}

async function fetchDisplayAds(domain: string, timePeriod: string) {
  return fetchOnce({
    engine: "google_ads_transparency_center",
    domain,
    ad_format: "image",
    num: MAX_ADS_PER_FORMAT,
    time_period: timePeriod,
  });
}

async function fetchVideoAds(domain: string, timePeriod: string) {
  return fetchOnce({
    engine: "google_ads_transparency_center",
    domain,
    ad_format: "video",
    num: MAX_ADS_PER_FORMAT,
    time_period: timePeriod,
  });
}

/* ============================================================================
   Tool Registration
   ============================================================================ */

export function registerFairCherTool(): ToolRegistry {
  return {
    /* ------------------------------------------------------------------
       TOOL 1: DOMAIN SNAPSHOT (QUALIFICATION)
       ------------------------------------------------------------------ */

    faircher_domain_ads_summary: {
      definition: {
        name: "faircher_domain_ads_summary",
        description:
          "Returns a lightweight advertising activity snapshot for seller qualification. Not a creative-level tool.",
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
            throw new ValidationError("Invalid domain input");
          }

          const domain = normalizeDomain(args.domain);
          const timePeriod = computeTimePeriod(SNAPSHOT_LOOKBACK_DAYS);

          const [searchRaw, displayRaw, videoRaw] = await Promise.all([
            fetchSearchAds(domain, timePeriod),
            fetchDisplayAds(domain, timePeriod),
            fetchVideoAds(domain, timePeriod),
          ]);

          /**
           * NOTE:
           * normalizeAds handles:
           * - text → Search
           * - image → Display
           * - video → Video (metadata only)
           *
           * Creative enrichment (YouTube URL validation, etc.)
           * happens ONLY in the creative tool.
           */
          const ads = [
            ...normalizeAds({ upstream: searchRaw }),
            ...normalizeAds({ upstream: displayRaw }),
            ...normalizeAds({ upstream: videoRaw }),
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
            buildToolError(
              "upstream_error",
              "Upstream ads service unavailable.",
              {
                retryable: true,
                cause:
                  error instanceof Error ? error.message : "Unknown error",
              }
            )
          );
        }
      },
    },

    /* ------------------------------------------------------------------
       TOOL 2: CREATIVE INSIGHTS (INTENTIONALLY STUBBED)
       ------------------------------------------------------------------ */

    faircher_creative_ads_insights: {
      definition: {
        name: "faircher_creative_ads_insights",
        description:
          "Returns creative-level advertising insights for an advertiser or domain. Includes search, display, and validated video creatives.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description: "Advertiser name or apex domain",
            },
            formats: {
              type: "array",
              items: {
                enum: ["search", "display", "video"],
              },
              description: "Optional creative format filter",
            },
          },
        },
      },

      async run(args: { query: string; formats?: string[] }) {
        /**
         * This tool is WIRED but intentionally minimal.
         *
         * Video creatives MUST:
         * - Resolve to a YouTube URL
         * - Pass creative-details validation
         *
         * That logic belongs here, not in snapshot.
         */
        return wrapText({
          status: "ready_for_implementation",
          received: {
            query: args?.query,
            formats: args?.formats ?? "all",
          },
          note:
            "Creative APIs and YouTube validation will be implemented next.",
        });
      },
    },
  };
}

/* ============================================================================
   Output helpers (MCP-compatible)
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
