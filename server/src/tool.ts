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
   Constants (PERFORMANCE-SAFE)
   ============================================================================ */

const LOOKBACK_DAYS = 120;
const SEARCH_API_BASE = "https://www.searchapi.io/api/v1/search";

/* ============================================================================
   Helpers
   ============================================================================ */

function computeTimePeriod(days: number): string {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  return `${from.toISOString().slice(0, 10)}..${to
    .toISOString()
    .slice(0, 10)}`;
}

function getFetch(): typeof fetch {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("Fetch unavailable");
  }
  return globalThis.fetch;
}

async function fetchOnce(params: Record<string, any>) {
  const url = new URL(SEARCH_API_BASE);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });

  const res = await getFetch()(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${process.env.UPSTREAM_API_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return res.json();
}

/* ============================================================================
   Snapshot Fetch (UNCHANGED)
   ============================================================================ */

async function fetchSnapshot(
  domain: string,
  ad_format: "text" | "image" | "video",
  period: string
): Promise<UpstreamAdsPayload> {
  return fetchOnce({
    engine: "google_ads_transparency_center",
    domain,
    ad_format,
    num: 40,
    time_period: period,
  });
}

/* ============================================================================
   Creative Fetch (MOST RECENT ONLY)
   ============================================================================ */

type CreativeQuery = { domain?: string; advertiser?: string };

function resolveQuery(q: string): CreativeQuery {
  try {
    return { domain: normalizeDomain(q) };
  } catch {
    const t = q.trim();
    if (!t) throw new ValidationError("Invalid query");
    return { advertiser: t };
  }
}

async function fetchCreativeList(
  query: CreativeQuery,
  ad_format: "text" | "image" | "video",
  period: string
): Promise<UpstreamAdsPayload> {
  return fetchOnce({
    engine: "google_ads_transparency_center",
    ...query,
    ad_format,
    num: 1, // 🔑 MOST RECENT ONLY
    time_period: period,
  });
}

async function fetchAdDetails(advertiser_id: string, creative_id: string) {
  return fetchOnce({
    engine: "google_ads_transparency_center_ad_details",
    advertiser_id,
    creative_id,
  });
}

async function fetchTranscript(videoId: string) {
  return fetchOnce({
    engine: "youtube_transcripts",
    video_id: videoId,
    lang: "en",
    only_available: true,
  });
}

/* ============================================================================
   Tool Registry
   ============================================================================ */

export function registerFairCherTool(): ToolRegistry {
  return {
    /* ============================================================
       SNAPSHOT TOOL
       ============================================================ */

    faircher_domain_ads_summary: {
      definition: {
        name: "faircher_domain_ads_summary",
        description:
          "High-level advertising activity snapshot for seller qualification.",
        inputSchema: {
          type: "object",
          required: ["domain"],
          properties: { domain: { type: "string" } },
        },
      },

      async run({ domain }: { domain: string }) {
        try {
          const d = normalizeDomain(domain);
          const period = computeTimePeriod(LOOKBACK_DAYS);

          const [s, i, v] = await Promise.all([
            fetchSnapshot(d, "text", period),
            fetchSnapshot(d, "image", period),
            fetchSnapshot(d, "video", period),
          ]);

          const ads = [
            ...normalizeAds({ upstream: s }),
            ...normalizeAds({ upstream: i }),
            ...normalizeAds({ upstream: v }),
          ];

          return wrapText(
            buildSellerSummary(
              analyzeAds({ domain: d, ads, infrastructure: null })
            )
          );
        } catch (e) {
          return wrapText(
            buildToolError("upstream_error", "Snapshot failed")
          );
        }
      },
    },

    /* ============================================================
       CREATIVE INSIGHTS TOOL (FAST)
       ============================================================ */

    faircher_creative_ads_insights: {
      definition: {
        name: "faircher_creative_ads_insights",
        description:
          "Seller-ready creative insights: CTAs, landing domains, and summarized video messaging.",
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

      async run({ query, formats }: { query: string; formats?: string[] }) {
        try {
          const f = new Set(formats ?? ["search", "display", "video"]);
          const q = resolveQuery(query);
          const period = computeTimePeriod(LOOKBACK_DAYS);

          const [s, i, v] = await Promise.all([
            f.has("search") ? fetchCreativeList(q, "text", period) : undefined,
            f.has("display") ? fetchCreativeList(q, "image", period) : undefined,
            f.has("video") ? fetchCreativeList(q, "video", period) : undefined,
          ]);

          const creatives = await normalizeCreatives({
            search: s,
            display: i,
            video: v,
            fetchAdDetails,
            fetchTranscript,
          });

          return wrapText({
            query,
            formats_returned: [...f],
            totals: {
              search_ads: creatives.search_ads.length,
              display_ads: creatives.display_ads.length,
              video_ads: creatives.video_ads.length,
            },
            creatives,
            notes:
              "Insights optimized for fast seller workflows. One top creative per format.",
          });
        } catch (e) {
          return wrapText(
            buildToolError("upstream_error", "Creative insights failed")
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
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function buildToolError(
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>
): ToolError {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
