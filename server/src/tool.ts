import { normalizeDomain } from "./normalize";
import { ValidationError } from "./errors";
import { analyzeAds } from "./ads_analysis";
import { normalizeAds } from "./normalize_ads";
import { buildSellerSummary } from "./summary_builder";
import { normalizeCreatives } from "./normalize_creatives";

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
   Creative fetchers (query-based)
   ============================================================================ */

type CreativeQueryParams = {
  domain?: string;
  advertiser?: string;
};

function resolveCreativeQuery(query: string): CreativeQueryParams {
  try {
    return { domain: normalizeDomain(query) };
  } catch (error) {
    if (error instanceof ValidationError) {
      const trimmed = query.trim();
      if (!trimmed) {
        throw new ValidationError("Invalid query input");
      }
      return { advertiser: trimmed };
    }
    throw error;
  }
}

function fetchCreativeAds(
  queryParams: CreativeQueryParams,
  adFormat: "text" | "image" | "video",
  timePeriod: string
) {
  return fetchOnce({
    engine: "google_ads_transparency_center",
    ...queryParams,
    ad_format: adFormat,
    num: MAX_ADS_PER_FORMAT,
    time_period: timePeriod,
  });
}

async function fetchCreativeDetails(detailsLink?: string, adId?: string) {
  if (detailsLink) {
    return fetchOnce({
      engine: "google_ads_transparency_center",
      details_link: detailsLink,
    });
  }

  if (adId) {
    return fetchOnce({
      engine: "google_ads_transparency_center",
      ad_id: adId,
    });
  }

  return {};
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
        try {
          if (
            !args ||
            typeof args.query !== "string" ||
            args.query.trim().length === 0
          ) {
            throw new ValidationError("Invalid query input");
          }

          const requestedFormats = args.formats ?? [
            "search",
            "display",
            "video",
          ];

          const invalidFormats = requestedFormats.filter(
            format =>
              format !== "search" && format !== "display" && format !== "video"
          );

          if (invalidFormats.length > 0) {
            throw new ValidationError("Invalid formats filter");
          }

          const formats = new Set(requestedFormats);
          const queryParams = resolveCreativeQuery(args.query);
          const timePeriod = computeTimePeriod(SNAPSHOT_LOOKBACK_DAYS);

          const [searchRaw, displayRaw, videoRaw] = await Promise.all([
            formats.has("search")
              ? fetchCreativeAds(queryParams, "text", timePeriod)
              : Promise.resolve(null),
            formats.has("display")
              ? fetchCreativeAds(queryParams, "image", timePeriod)
              : Promise.resolve(null),
            formats.has("video")
              ? fetchCreativeAds(queryParams, "video", timePeriod)
              : Promise.resolve(null),
          ]);

          const normalized = await normalizeCreatives({
            search: searchRaw ?? undefined,
            display: displayRaw ?? undefined,
            video: videoRaw ?? undefined,
            fetchVideoDetails: creative =>
              fetchCreativeDetails(creative.details_link, creative.id),
          });

          const response = {
            query: args.query,
            formats_returned: Array.from(formats),
            totals: {
              search_ads: normalized.search_ads.length,
              display_ads: normalized.display_ads.length,
              video_ads: normalized.video_ads.length,
            },
            creatives: {
              search_ads: normalized.search_ads,
              display_ads: normalized.display_ads,
              video_ads: normalized.video_ads,
            },
            notes:
              "Video creatives are returned only when a YouTube URL is present in creative details.",
          };

          return wrapText(response);
        } catch (error) {
          if (error instanceof ValidationError) {
            return wrapText(
              buildToolError(
                "invalid_domain",
                "Query must be a valid domain or advertiser name.",
                { query: args?.query, formats: args?.formats }
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
