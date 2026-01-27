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
   Snapshot fetchers (UNCHANGED)
   ============================================================================ */

async function fetchSnapshotAds(domain: string, ad_format: string, timePeriod: string) {
  return fetchOnce({
    engine: "google_ads_transparency_center",
    domain,
    ad_format,
    num: MAX_ADS_PER_FORMAT,
    time_period: timePeriod,
  });
}

/* ============================================================================
   Creative list fetch
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
) {
  return fetchOnce({
    engine: "google_ads_transparency_center",
    ...query,
    ad_format,
    num: MAX_ADS_PER_FORMAT,
    time_period: timePeriod,
  });
}

/* ============================================================================
   Ad Details fetch (MANDATORY FOR ALL FORMATS)
   ============================================================================ */

async function fetchAdDetails(advertiser_id: string, creative_id: string) {
  return fetchOnce({
    engine: "google_ads_transparency_center_ad_details",
    advertiser_id,
    creative_id,
  });
}

/* ============================================================================
   YouTube Transcript fetch (VIDEO ONLY)
   ============================================================================ */

async function fetchYouTubeTranscript(videoId: string) {
  return fetchOnce({
    engine: "youtube_transcripts",
    video_id: videoId,
    only_available: true,
    lang: "en",
  });
}

/* ============================================================================
   Tool Registration
   ============================================================================ */

export function registerFairCherTool(): ToolRegistry {
  return {
    /* ============================================================
       TOOL 1: DOMAIN SNAPSHOT (NO CHANGE)
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
       TOOL 2: CREATIVE ADS INSIGHTS (FULL FLOW)
       ============================================================ */

    faircher_creative_ads_insights: {
      definition: {
        name: "faircher_creative_ads_insights",
        description:
          "Returns creative-level advertising insights including ad copy, CTAs, images, and video transcripts when available.",
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

          const listResults = {
            search: formats.has("search")
              ? await fetchCreativeList(queryParams, "text", timePeriod)
              : undefined,
            display: formats.has("display")
              ? await fetchCreativeList(queryParams, "image", timePeriod)
              : undefined,
            video: formats.has("video")
              ? await fetchCreativeList(queryParams, "video", timePeriod)
              : undefined,
          };

          async function hydrate(list: any) {
            if (!list?.ad_creatives) return [];
            const results = [];
            for (const c of list.ad_creatives) {
              if (!c.advertiser?.id || !c.id) continue;
              const details = await fetchAdDetails(c.advertiser.id, c.id);
              results.push(details);
            }
            return results;
          }

          const normalized = normalizeCreatives({
            search: await hydrate(listResults.search),
            display: await hydrate(listResults.display),
            video: await hydrate(listResults.video),
          });

          return wrapText({
            query: args.query,
            formats_returned: Array.from(formats),
            totals: {
              search_ads: normalized.search_ads.length,
              display_ads: normalized.display_ads.length,
              video_ads: normalized.video_ads.length,
            },
            creatives: normalized,
            notes:
              "All creatives are sourced from Ad Details API. Video ads include YouTube transcripts when available.",
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
  details?: Record<string, unknown>
): ToolError {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
