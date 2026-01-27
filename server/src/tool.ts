import { normalizeDomain } from "./normalize";
import { ValidationError } from "./errors";
import { analyzeAds } from "./ads_analysis";
import { normalizeAds } from "./normalize_ads";
import { buildSellerSummary } from "./summary_builder";
import { normalizeCreatives } from "./normalize_creatives";
import type { UpstreamAdsPayload } from "./upstream";

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
   Constants (PERFORMANCE SAFE)
   ============================================================================ */

const SNAPSHOT_LOOKBACK_DAYS = 120;

/**
 * HARD LIMIT:
 * Only the MOST RECENT creative per format.
 */
const MAX_CREATIVES_PER_FORMAT = 1;

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
    throw new Error("Fetch API unavailable");
  }
  return globalThis.fetch;
}

async function fetchOnce(params: Record<string, any>) {
  const url = new URL(SEARCH_API_BASE);

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  });

  const res = await getFetch()(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${process.env.UPSTREAM_API_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Upstream error (${res.status})`);
  }

  return res.json();
}

/* ============================================================================
   Snapshot fetch (unchanged, cheap)
   ============================================================================ */

async function fetchSnapshotAds(
  domain: string,
  ad_format: "text" | "image" | "video",
  timePeriod: string
): Promise<UpstreamAdsPayload> {
  return fetchOnce({
    engine: "google_ads_transparency_center",
    domain,
    ad_format,
    num: 40,
    time_period: timePeriod,
  });
}

/* ============================================================================
   Creative list fetch (MOST RECENT ONLY)
   ============================================================================ */

type CreativeQueryParams = { domain?: string; advertiser?: string };

function resolveCreativeQuery(query: string): CreativeQueryParams {
  try {
    return { domain: normalizeDomain(query) };
  } catch {
    const trimmed = query.trim();
    if (!trimmed) throw new ValidationError("Invalid query");
    return { advertiser: trimmed };
  }
}

async function fetchCreativeList(
  query: CreativeQueryParams,
  ad_format: "text" | "image" | "video",
  timePeriod: string
): Promise<UpstreamAdsPayload> {
  return fetchOnce({
    engine: "google_ads_transparency_center",
    ...query,
    ad_format,
    num: MAX_CREATIVES_PER_FORMAT,
    time_period: timePeriod,
  });
}

/* ============================================================================
   Ad Details (MANDATORY, SINGLE CALL)
   ============================================================================ */

async function fetchAdDetails(advertiser_id: string, creative_id: string) {
  return fetchOnce({
    engine: "google_ads_transparency_center_ad_details",
    advertiser_id,
    creative_id,
  });
}

/* ============================================================================
   YouTube Transcript (VIDEO ONLY, CONDITIONAL)
   ============================================================================ */

async function fetchYouTubeTranscript(videoId: string) {
  return fetchOnce({
    engine: "youtube_transcripts",
    video_id: videoId,
    lang: "en",
    only_available: true,
  });
}

/* ============================================================================
   Tool Registration
   ============================================================================ */

export function registerFairCherTool(): ToolRegistry {
  return {
    /* ============================================================
       TOOL 1: DOMAIN SNAPSHOT
       ============================================================ */

    faircher_domain_ads_summary: {
      definition: {
        name: "faircher_domain_ads_summary",
        description:
          "Returns a lightweight advertising activity snapshot for seller qualification.",
        inputSchema: {
          type: "object",
          required: ["domain"],
          properties: {
            domain: { type: "string" },
          },
        },
      },

      async run(args: { domain: string }) {
        try {
          const domain = normalizeDomain(args.domain);
          const timePeriod = computeTimePeriod(SNAPSHOT_LOOKBACK_DAYS);

          const [searchRaw, displayRaw, videoRaw] = await Promise.all([
            fetchSnapshotAds(domain, "text", timePeriod),
            fetchSnapshotAds(domain, "image", timePeriod),
            fetchSnapshotAds(domain, "video", timePeriod),
          ]);

          const ads = [
            ...normalizeAds({ upstream: searchRaw }),
            ...normalizeAds({ upstream: displayRaw }),
            ...normalizeAds({ upstream: videoRaw }),
          ];

          const analysis = analyzeAds({ domain, ads, infrastructure: null });
          return wrapText(buildSellerSummary(analysis));
        } catch (err) {
          return wrapText(
            buildToolError("upstream_error", "Snapshot unavailable", {
              cause: err instanceof Error ? err.message : "Unknown",
            })
          );
        }
      },
    },

    /* ============================================================
       TOOL 2: CREATIVE ADS INSIGHTS (FAST + SAFE)
       ============================================================ */

    faircher_creative_ads_insights: {
      definition: {
        name: "faircher_creative_ads_insights",
        description:
          "Returns seller-ready creative insights including CTAs, landing domains, and summarized video messaging.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            formats: {
              type: "array",
              items: { enum: ["search", "display", "video"] },
            },
          },
        },
      },

      async run(args: { query: string; formats?: string[] }) {
        try {
          const formats = new Set(args.formats ?? ["search", "display", "video"]);
          const queryParams = resolveCreativeQuery(args.query);
          const timePeriod = computeTimePeriod(SNAPSHOT_LOOKBACK_DAYS);

          const [search, display, video] = await Promise.all([
            formats.has("search")
              ? fetchCreativeList(queryParams, "text", timePeriod)
              : undefined,
            formats.has("display")
              ? fetchCreativeList(queryParams, "image", timePeriod)
              : undefined,
            formats.has("video")
              ? fetchCreativeList(queryParams, "video", timePeriod)
              : undefined,
          ]);

          const normalized = await normalizeCreatives({
            search,
            display,
            video,
            fetchAdDetails,
            fetchTranscript: fetchYouTubeTranscript,
          });

          return wrapText({
            query: args.query,
            creatives: normalized,
            notes:
              "Insights are curated for sales conversations. Video messaging is summarized from transcript content.",
          });
        } catch (err) {
          return wrapText(
            buildToolError("upstream_error", "Creative insights unavailable", {
              cause: err instanceof Error ? err.message : "Unknown",
            })
          );
        }
      },
    },
  };
}

/* ============================================================================
   Output helpers
   ============================================================================ */

function wrapText(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function buildToolError(
  code: ToolErrorCode,
  message: string,
  details?: Record<string,
