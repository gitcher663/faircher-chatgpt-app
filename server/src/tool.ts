import { normalizeDomain } from "./normalize";
import { ValidationError } from "./errors";
import { analyzeAds } from "./ads_analysis";
import { normalizeAds } from "./normalize_ads";
import { buildSellerSummary } from "./summary_builder";
import {
  normalizeIsoDate,
  daysBetween,
  extractDomainFromUrl,
  extractYouTubeId,
} from "./normalize_creatives";
import type { UpstreamAdsPayload } from "./upstream";

/* ============================================================================
   Tool Types
   ============================================================================ */

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
  _meta?: Record<string, unknown>;
};

export type ToolRuntime = {
  definition: ToolDefinition;
  run: (args: any) => Promise<any>;
};

export type ToolRegistry = Record<string, ToolRuntime>;

type ToolErrorCode = "invalid_domain" | "invalid_query" | "upstream_error";

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
const CREATIVE_LOOKBACK_DAYS = 60;

/**
 * HARD LIMIT:
 * Only the MOST RECENT creative per format.
 */
const MAX_CREATIVES_PER_FORMAT = 1;

const SEARCH_API_BASE = "https://www.searchapi.io/api/v1/search";

const DEFAULT_TIMEOUT_MS = 10000;
const TRANSCRIPT_TIMEOUT_MS = 1800;
const DEFAULT_RETRIES = 2;
const TRANSCRIPT_RETRIES = 0;
const BASE_RETRY_DELAY_MS = 400;

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

class UpstreamError extends Error {
  status?: number;
  code?: "timeout" | "network";

  constructor(message: string, status?: number, code?: "timeout" | "network") {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.code = code;
  }
}

function getFetch(): typeof fetch {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("Fetch API unavailable");
  }
  return globalThis.fetch;
}

function getApiKey(): string {
  const apiKey = process.env.UPSTREAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing UPSTREAM_API_KEY");
  }
  return apiKey;
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = BASE_RETRY_DELAY_MS,
  }: { timeoutMs?: number; retries?: number; retryDelayMs?: number } = {}
): Promise<Response> {
  let lastError: UpstreamError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await getFetch()(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = `Upstream error (${response.status})`;
        const error = new UpstreamError(message, response.status);
        if (!shouldRetryStatus(response.status)) {
          throw error;
        }
        lastError = error;
      } else {
        return response;
      }
    } catch (error) {
      if (error instanceof UpstreamError) {
        lastError = error;
      } else if ((error as Error)?.name === "AbortError") {
        lastError = new UpstreamError("Upstream request timed out", undefined, "timeout");
      } else {
        lastError = new UpstreamError(
          error instanceof Error ? error.message : "Network error",
          undefined,
          "network"
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (attempt < retries) {
      const jitter = Math.random() * 100;
      const delay = retryDelayMs * Math.pow(2, attempt) + jitter;
      await sleep(delay);
    }
  }

  throw lastError ?? new UpstreamError("Upstream request failed");
}

async function fetchJson(
  params: Record<string, any>,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
  }: { timeoutMs?: number; retries?: number } = {}
) {
  const url = new URL(SEARCH_API_BASE);

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  });

  const response = await fetchWithRetry(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
  }, {
    timeoutMs,
    retries,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new UpstreamError(`Upstream error (${response.status}): ${text}`, response.status);
  }

  return response.json();
}

/* ============================================================================
   Snapshot fetch (unchanged, cheap)
   ============================================================================ */

async function fetchSnapshotAds(
  domain: string,
  ad_format: "text" | "image" | "video",
  timePeriod: string
): Promise<UpstreamAdsPayload> {
  return fetchJson({
    engine: "google_ads_transparency_center",
    domain,
    ad_format,
    num: 40,
    time_period: timePeriod,
  });
}

/* ============================================================================
   Advertiser resolution
   ============================================================================ */

type CreativeResolution =
  | { kind: "domain"; domain: string }
  | { kind: "advertiser"; advertiser_id: string; advertiser_name: string | null };

type AdvertiserSearchResponse = {
  advertisers?: Array<{ id?: string; name?: string }>;
  domains?: Array<{ name?: string }>;
};

async function fetchAdvertiserSearch(keyword: string): Promise<AdvertiserSearchResponse> {
  return fetchJson({
    engine: "google_ads_transparency_center_advertiser_search",
    q: keyword,
  });
}

async function resolveCreativeQuery(
  query: string
): Promise<{ resolution: CreativeResolution | null; warnings: string[] }> {
  const warnings: string[] = [];
  const trimmed = query.trim();
  if (!trimmed) {
    throw new ValidationError("Query is required.");
  }

  try {
    return { resolution: { kind: "domain", domain: normalizeDomain(trimmed) }, warnings };
  } catch {
    const search = await fetchAdvertiserSearch(trimmed);
    const advertiser = search.advertisers?.[0];
    const domain = search.domains?.[0];

    if (advertiser?.id) {
      return {
        resolution: {
          kind: "advertiser",
          advertiser_id: advertiser.id,
          advertiser_name: advertiser.name ?? null,
        },
        warnings,
      };
    }

    if (domain?.name) {
      return { resolution: { kind: "domain", domain: domain.name }, warnings };
    }

    warnings.push("advertiser_not_found");
    return { resolution: null, warnings };
  }
}

/* ============================================================================
   Creative list fetch (MOST RECENT ONLY)
   ============================================================================ */

type CreativeQueryParams = {
  domain?: string;
  advertiser_id?: string;
  advertiser?: string;
};

async function fetchCreativeList(
  query: CreativeQueryParams,
  ad_format: "text" | "image" | "video",
  timePeriod: string
): Promise<UpstreamAdsPayload> {
  const payload = await fetchJson({
    engine: "google_ads_transparency_center",
    ...query,
    ad_format,
    num: MAX_CREATIVES_PER_FORMAT,
    time_period: timePeriod,
  });

  if (!Array.isArray(payload?.ad_creatives)) {
    payload.ad_creatives = [];
  }

  return payload as UpstreamAdsPayload;
}

async function fetchCreativeListForResolution(
  resolution: CreativeResolution,
  ad_format: "text" | "image" | "video",
  timePeriod: string,
  warnings: string[]
): Promise<UpstreamAdsPayload> {
  if (resolution.kind === "domain") {
    return fetchCreativeList({ domain: resolution.domain }, ad_format, timePeriod);
  }

  try {
    return await fetchCreativeList(
      { advertiser_id: resolution.advertiser_id },
      ad_format,
      timePeriod
    );
  } catch (error) {
    if (
      error instanceof UpstreamError &&
      error.status &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429 &&
      resolution.advertiser_name
    ) {
      warnings.push("advertiser_id_param_unsupported_fallback");
      return fetchCreativeList(
        { advertiser: resolution.advertiser_name },
        ad_format,
        timePeriod
      );
    }

    throw error;
  }
}

/* ============================================================================
   Ad Details (MANDATORY, SINGLE CALL)
   ============================================================================ */

async function fetchAdDetails(advertiser_id: string, creative_id: string) {
  return fetchJson({
    engine: "google_ads_transparency_center_ad_details",
    advertiser_id,
    creative_id,
  });
}

/* ============================================================================
   YouTube Transcript (VIDEO ONLY, CONDITIONAL)
   ============================================================================ */

async function fetchYouTubeTranscript(videoId: string) {
  return fetchJson(
    {
      engine: "youtube_transcripts",
      video_id: videoId,
      lang: "en",
      only_available: true,
    },
    {
      timeoutMs: TRANSCRIPT_TIMEOUT_MS,
      retries: TRANSCRIPT_RETRIES,
    }
  );
}

/* ============================================================================
   Creative helpers
   ============================================================================ */

type CreativeOutput = {
  id: string | null;
  name: string | null;
  ad_format: "Search Ads" | "Display Ads" | "Video Ads";
  advertiser_name: string | null;
  first_seen: string | null;
  last_seen: string | null;
  days_active: number | null;
  call_to_action: string | null;
  landing_url: string | null;
  landing_domain: string | null;
};

type VideoOutput = {
  youtube_video_id: string | null;
  transcript_status: "ok" | "unavailable" | "timeout";
  transcript_text: string | null;
  video_length_seconds: number | null;
};

function isFullUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extractLandingUrl(variation: any): { landing_url: string | null; landing_domain: string | null } {
  const link = variation?.link ?? null;
  const displayedLink = variation?.displayed_link ?? null;
  const domain = variation?.domain ?? null;

  if (link && isFullUrl(link)) {
    return {
      landing_url: link,
      landing_domain: extractDomainFromUrl(link),
    };
  }

  if (displayedLink && isFullUrl(displayedLink)) {
    return {
      landing_url: displayedLink,
      landing_domain: extractDomainFromUrl(displayedLink),
    };
  }

  return {
    landing_url: null,
    landing_domain: domain ? domain.replace(/^www\./, "") : null,
  };
}

function buildCreativeOutput(
  creative: NonNullable<UpstreamAdsPayload["ad_creatives"]>[number],
  variation: any,
  formatLabel: CreativeOutput["ad_format"],
  advertiserNameFallback: string | null
): CreativeOutput {
  const first = normalizeIsoDate(creative.first_shown_datetime);
  const last = normalizeIsoDate(creative.last_shown_datetime);
  const { landing_url, landing_domain } = extractLandingUrl(variation);

  return {
    id: creative.id ?? null,
    name: variation?.title ?? variation?.long_headline ?? null,
    ad_format: formatLabel,
    advertiser_name: creative.advertiser?.name ?? advertiserNameFallback ?? null,
    first_seen: first,
    last_seen: last,
    days_active: first && last ? daysBetween(first, last) : null,
    call_to_action: variation?.call_to_action ?? null,
    landing_url,
    landing_domain,
  };
}

async function buildVideoOutput(
  variation: any,
  warnings: string[]
): Promise<VideoOutput> {
  const candidates = [
    variation?.video_link,
    variation?.thumbnail,
    variation?.link,
    variation?.displayed_link,
  ].filter(Boolean) as string[];

  const youtube_video_id = candidates
    .map(url => extractYouTubeId(url))
    .find(Boolean) ?? null;

  if (!youtube_video_id) {
    warnings.push("transcript_unavailable");
    return {
      youtube_video_id: null,
      transcript_status: "unavailable",
      transcript_text: null,
      video_length_seconds: null,
    };
  }

  try {
    const transcript = await fetchYouTubeTranscript(youtube_video_id);
    const segments = Array.isArray(transcript?.transcripts)
      ? transcript.transcripts
      : [];

    if (!segments.length) {
      warnings.push("transcript_unavailable");
      return {
        youtube_video_id,
        transcript_status: "unavailable",
        transcript_text: null,
        video_length_seconds: null,
      };
    }

    return {
      youtube_video_id,
      transcript_status: "ok",
      transcript_text: segments.map((t: any) => t.text).join(" "),
      video_length_seconds: segments.reduce(
        (sum: number, t: any) => sum + (t.duration ?? 0),
        0
      ),
    };
  } catch (error) {
    if (error instanceof UpstreamError && error.code === "timeout") {
      warnings.push("transcript_timeout");
      return {
        youtube_video_id,
        transcript_status: "timeout",
        transcript_text: null,
        video_length_seconds: null,
      };
    }

    warnings.push("transcript_unavailable");
    return {
      youtube_video_id,
      transcript_status: "unavailable",
      transcript_text: null,
      video_length_seconds: null,
    };
  }
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
          "Use this when you need a read-only advertising activity snapshot for a domain.",
        inputSchema: {
          type: "object",
          required: ["domain"],
          properties: {
            domain: {
              type: "string",
              description: "Apex/root domain (URLs will be normalized).",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
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
          if (err instanceof ValidationError) {
            return wrapText(
              buildToolError("invalid_domain", err.message, {
                domain: args.domain,
              })
            );
          }

          return wrapText(
            buildToolError("upstream_error", "Snapshot unavailable", {
              cause: err instanceof Error ? err.message : "Unknown",
            })
          );
        }
      },
    },

    /* ============================================================
       TOOL 2: SEARCH CREATIVE (MOST RECENT)
       ============================================================ */

    faircher_search_ad_creative: {
      definition: {
        name: "faircher_search_ad_creative",
        description:
          "Use this when you need the most recent Search ad creative for a domain or advertiser keyword.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description: "A domain or advertiser keyword to resolve.",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
        },
      },

      async run(args: { query: string }) {
        return runCreativeTool("search", args);
      },
    },

    /* ============================================================
       TOOL 3: DISPLAY CREATIVE (MOST RECENT)
       ============================================================ */

    faircher_display_ad_creative: {
      definition: {
        name: "faircher_display_ad_creative",
        description:
          "Use this when you need the most recent Display ad creative for a domain or advertiser keyword.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description: "A domain or advertiser keyword to resolve.",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
        },
      },

      async run(args: { query: string }) {
        return runCreativeTool("display", args);
      },
    },

    /* ============================================================
       TOOL 4: VIDEO CREATIVE (MOST RECENT)
       ============================================================ */

    faircher_video_ad_creative: {
      definition: {
        name: "faircher_video_ad_creative",
        description:
          "Use this when you need the most recent Video ad creative for a domain or advertiser keyword.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description: "A domain or advertiser keyword to resolve.",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
        },
      },

      async run(args: { query: string }) {
        return runCreativeTool("video", args);
      },
    },
  };
}

async function runCreativeTool(
  format: "search" | "display" | "video",
  args: { query: string }
) {
  const warnings: string[] = [];

  try {
    const { resolution, warnings: resolveWarnings } = await resolveCreativeQuery(
      args.query
    );
    warnings.push(...resolveWarnings);

    if (!resolution) {
      return wrapText({
        query: args.query,
        format,
        creative: null,
        video: null,
        source: "google_ads_transparency_center",
        warnings,
      });
    }

    const timePeriod = computeTimePeriod(CREATIVE_LOOKBACK_DAYS);
    const adFormat = format === "search" ? "text" : format === "display" ? "image" : "video";
    const formatLabel = format === "search" ? "Search Ads" : format === "display" ? "Display Ads" : "Video Ads";

    const listPayload = await fetchCreativeListForResolution(
      resolution,
      adFormat,
      timePeriod,
      warnings
    );

    const creative = listPayload.ad_creatives?.[0];
    if (!creative) {
      warnings.push("no_creatives_found");
      return wrapText({
        query: args.query,
        format,
        creative: null,
        video: null,
        source: "google_ads_transparency_center",
        warnings,
      });
    }

    const creativeId = creative.id ?? null;
    if (!creativeId) {
      warnings.push("missing_creative_id");
      return wrapText({
        query: args.query,
        format,
        creative: null,
        video: null,
        source: "google_ads_transparency_center",
        warnings,
      });
    }

    const advertiserId =
      creative.advertiser?.id ??
      (resolution.kind === "advertiser" ? resolution.advertiser_id : null);

    if (!advertiserId) {
      warnings.push("missing_advertiser_id");
      return wrapText({
        query: args.query,
        format,
        creative: null,
        video: null,
        source: "google_ads_transparency_center",
        warnings,
      });
    }

    const details = await fetchAdDetails(advertiserId, creativeId);
    const variation = details?.variations?.[0];

    if (!variation) {
      warnings.push("missing_ad_details_variation");
      return wrapText({
        query: args.query,
        format,
        creative: null,
        video: null,
        source: "google_ads_transparency_center",
        warnings,
      });
    }

    const creativeOutput = buildCreativeOutput(
      creative,
      variation,
      formatLabel,
      resolution.kind === "advertiser" ? resolution.advertiser_name : null
    );

    const videoOutput =
      format === "video" ? await buildVideoOutput(variation, warnings) : null;

    return wrapText({
      query: args.query,
      format,
      creative: creativeOutput,
      video: videoOutput,
      source: "google_ads_transparency_center",
      warnings,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return wrapText(
        buildToolError("invalid_query", err.message, {
          query: args.query,
        })
      );
    }

    return wrapText(
      buildToolError("upstream_error", "Creative fetch unavailable", {
        cause: err instanceof Error ? err.message : "Unknown",
      })
    );
  }
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
  return {
    error: {
      code,
      message,
      details,
    },
  };
}
