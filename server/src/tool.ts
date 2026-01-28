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
const LENS_TIMEOUT_MS = 6000;

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

async function fetchGoogleLens(url: string, country?: string) {
  return fetchJson(
    {
      engine: "google_lens",
      search_type: "all",
      url,
      country: country ?? "US",
    },
    {
      timeoutMs: LENS_TIMEOUT_MS,
      retries: 0,
    }
  );
}

function extractLensText(lensPayload: any): string | null {
  const allowedKeys = new Set([
    "text",
    "extracted_text",
    "ocr",
    "ocr_text",
    "text_extracted",
  ]);

  const queue: any[] = [lensPayload];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;

    if (Array.isArray(current)) {
      current.forEach(item => queue.push(item));
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (allowedKeys.has(key)) {
        if (typeof value === "string") {
          const text = compactText(value);
          if (text) return text;
        }
        if (Array.isArray(value)) {
          const joined = compactText(
            value.filter(item => typeof item === "string").join(" ")
          );
          if (joined) return joined;
        }
      }

      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return null;
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
  advertisers?: Array<Record<string, unknown>>;
  domains?: Array<Record<string, unknown> | string>;
};

async function fetchAdvertiserSearch(
  keyword: string,
  region?: string
): Promise<AdvertiserSearchResponse> {
  return fetchJson({
    engine: "google_ads_transparency_center_advertiser_search",
    q: keyword,
    region,
  });
}

function normalizeAdvertiserId(advertiser: Record<string, unknown>) {
  return (
    advertiser.id ??
    advertiser.advertiser_id ??
    advertiser.advertiserId ??
    null
  );
}

function normalizeAdvertiserName(advertiser: Record<string, unknown>) {
  return (
    advertiser.name ??
    advertiser.advertiser_name ??
    advertiser.advertiserName ??
    null
  );
}

function normalizeDomainName(domain: Record<string, unknown> | string) {
  if (typeof domain === "string") return domain;
  return (
    (domain as { name?: unknown }).name ??
    (domain as { domain?: unknown }).domain ??
    (domain as { website?: unknown }).website ??
    null
  );
}

type AdvertiserCandidate = {
  name: string;
  advertiser_id: string;
  region: string | null;
  ads_count: { lower: number | null; upper: number | null };
  is_verified: boolean;
};

type DomainCandidate = {
  domain: string;
};

type AdvertiserRecommendation = {
  needs_clarification: boolean;
  recommended_domain: string | null;
  recommended_advertiser_id: string | null;
  options: Array<{ type: "domain" | "advertiser"; label: string; value: string }>;
  clarification_prompt: string | null;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeAdsCount(raw: unknown): { lower: number | null; upper: number | null } {
  if (raw === null || raw === undefined) {
    return { lower: null, upper: null };
  }

  if (typeof raw === "number" || typeof raw === "string") {
    const value = parseNumber(raw);
    return { lower: value, upper: value };
  }

  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const lower = parseNumber(
      record.lower ??
        record.lower_bound ??
        record.min ??
        record.minimum ??
        record.count
    );
    const upper = parseNumber(
      record.upper ??
        record.upper_bound ??
        record.max ??
        record.maximum ??
        record.max_value ??
        record.count
    );
    return { lower, upper };
  }

  return { lower: null, upper: null };
}

function normalizeAdvertiserCandidates(payload: AdvertiserSearchResponse) {
  const advertisersRaw = Array.isArray(payload.advertisers) ? payload.advertisers : [];
  const domainsRaw = Array.isArray(payload.domains) ? payload.domains : [];
  const advertisers: AdvertiserCandidate[] = [];
  const domains: DomainCandidate[] = [];

  for (const advertiser of advertisersRaw) {
    if (!advertiser || typeof advertiser !== "object") continue;
    const advertiserId = normalizeAdvertiserId(advertiser);
    const advertiserName = normalizeAdvertiserName(advertiser);
    if (!advertiserId || typeof advertiserId !== "string") continue;
    const region =
      (advertiser as { region?: unknown }).region ??
      (advertiser as { country?: unknown }).country ??
      (advertiser as { region_code?: unknown }).region_code ??
      null;
    const adsCount = normalizeAdsCount((advertiser as { ads_count?: unknown }).ads_count);
    const isVerifiedRaw =
      (advertiser as { is_verified?: unknown }).is_verified ??
      (advertiser as { verified?: unknown }).verified ??
      false;
    const is_verified =
      typeof isVerifiedRaw === "boolean"
        ? isVerifiedRaw
        : typeof isVerifiedRaw === "string"
          ? isVerifiedRaw.toLowerCase() === "true"
          : Boolean(isVerifiedRaw);

    advertisers.push({
      name: typeof advertiserName === "string" ? advertiserName : "Unknown advertiser",
      advertiser_id: advertiserId,
      region: typeof region === "string" ? region : null,
      ads_count: adsCount,
      is_verified,
    });
  }

  const seenDomains = new Set<string>();
  for (const domain of domainsRaw) {
    const name = normalizeDomainName(domain);
    if (typeof name !== "string") continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seenDomains.has(key)) continue;
    seenDomains.add(key);
    domains.push({ domain: trimmed });
  }

  return { advertisers, domains };
}

function buildClarificationOptions(
  advertisers: AdvertiserCandidate[],
  domains: DomainCandidate[]
) {
  const options: AdvertiserRecommendation["options"] = [];

  advertisers.slice(0, 5).forEach(advertiser => {
    options.push({
      type: "advertiser",
      label: `${advertiser.name} (${advertiser.advertiser_id})`,
      value: advertiser.advertiser_id,
    });
  });

  domains.slice(0, 5).forEach(domain => {
    options.push({
      type: "domain",
      label: domain.domain,
      value: domain.domain,
    });
  });

  return options;
}

function extractNameTokens(name: string) {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const filtered = tokens.filter(token => token.length > 2);
  return filtered.length ? filtered : tokens;
}

function findMatchingDomain(domains: DomainCandidate[], advertiserName: string | null) {
  if (!advertiserName) return null;
  const tokens = extractNameTokens(advertiserName);
  if (!tokens.length) return null;
  for (const domain of domains) {
    const lowerDomain = domain.domain.toLowerCase();
    if (tokens.some(token => lowerDomain.includes(token))) {
      return domain.domain;
    }
  }
  return null;
}

function getUpperCount(adsCount: { lower: number | null; upper: number | null }) {
  return adsCount.upper ?? adsCount.lower ?? null;
}

function buildAdvertiserRecommendation({
  query,
  advertisers,
  domains,
}: {
  query: string;
  advertisers: AdvertiserCandidate[];
  domains: DomainCandidate[];
}): AdvertiserRecommendation {
  if (domains.length === 1) {
    return {
      needs_clarification: false,
      recommended_domain: domains[0].domain,
      recommended_advertiser_id: null,
      options: [],
      clarification_prompt: null,
    };
  }

  const topAdvertiser = advertisers[0] ?? null;
  if (topAdvertiser?.is_verified) {
    const topUpper = getUpperCount(topAdvertiser.ads_count);
    const otherUppers = advertisers
      .slice(1)
      .map(advertiser => getUpperCount(advertiser.ads_count))
      .filter((value): value is number => typeof value === "number");
    const nextUpper = otherUppers.length ? Math.max(...otherUppers) : null;
    const isClearlyHighest =
      typeof topUpper === "number" &&
      (nextUpper === null || topUpper >= 2 * nextUpper);
    if (isClearlyHighest) {
      const matchingDomain = findMatchingDomain(domains, topAdvertiser.name);
      if (matchingDomain) {
        return {
          needs_clarification: false,
          recommended_domain: matchingDomain,
          recommended_advertiser_id: topAdvertiser.advertiser_id,
          options: [],
          clarification_prompt: null,
        };
      }
    }
  }

  return {
    needs_clarification: true,
    recommended_domain: null,
    recommended_advertiser_id: null,
    options: buildClarificationOptions(advertisers, domains),
    clarification_prompt: `Which advertiser or domain should I use for "${query}"?`,
  };
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
    const advertiserId =
      advertiser && typeof advertiser === "object"
        ? normalizeAdvertiserId(advertiser as Record<string, unknown>)
        : null;
    const advertiserName =
      advertiser && typeof advertiser === "object"
        ? normalizeAdvertiserName(advertiser as Record<string, unknown>)
        : null;
    const domainName = domain ? normalizeDomainName(domain) : null;

    if (advertiserId) {
      return {
        resolution: {
          kind: "advertiser",
          advertiser_id: advertiserId,
          advertiser_name: typeof advertiserName === "string" ? advertiserName : null,
        },
        warnings,
      };
    }

    if (typeof domainName === "string") {
      return { resolution: { kind: "domain", domain: domainName }, warnings };
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

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

function extractIconUrl(creative: any, details: any, variation: any): string | null {
  const candidates = [
    creative?.advertiser?.logo,
    creative?.advertiser?.icon,
    details?.advertiser?.logo,
    details?.advertiser?.icon,
    variation?.icon,
    variation?.logo,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && isFullUrl(candidate)) {
      return candidate;
    }
    if (candidate && typeof candidate === "object") {
      const url = (candidate as any).url ?? (candidate as any).image_url;
      if (typeof url === "string" && isFullUrl(url)) {
        return url;
      }
    }
  }

  return null;
}

function extractImageUrl(variation: any): string | null {
  const candidates = [
    variation?.image_url,
    variation?.image,
    variation?.imageUrl,
    variation?.thumbnail,
    variation?.thumbnail_url,
    variation?.thumbnailUrl,
    variation?.media,
    variation?.media_url,
    variation?.mediaUrl,
  ];

  for (const candidate of candidates) {
    const url = extractUrlFromValue(candidate);
    if (url) return url;
  }

  const images = variation?.images;
  if (Array.isArray(images)) {
    for (const image of images) {
      const url = extractUrlFromValue(image);
      if (url) return url;
    }
  }

  return null;
}

function extractUrlFromValue(value: any): string | null {
  if (typeof value === "string") {
    return isFullUrl(value) ? value : null;
  }

  if (value && typeof value === "object") {
    const candidates = [
      (value as any).url,
      (value as any).image_url,
      (value as any).imageUrl,
      (value as any).thumbnail,
      (value as any).thumbnail_url,
      (value as any).thumbnailUrl,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && isFullUrl(candidate)) {
        return candidate;
      }
    }
  }

  return null;
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
      transcript_text: compactText(segments.map((t: any) => t.text).join(" ")),
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

function buildSearchAdText(variation: any): string | null {
  const fields = [
    variation?.headline,
    variation?.headline_1,
    variation?.headline_2,
    variation?.headline_3,
    variation?.headline_4,
    variation?.headline_5,
    variation?.long_headline,
    variation?.title,
    variation?.description,
    variation?.description_1,
    variation?.description_2,
    variation?.description_3,
  ];

  const text = compactText(
    fields.filter(value => typeof value === "string" && value.trim()).join(" ")
  );

  return text || null;
}

function buildDisplayAdText(variation: any, lensText: string | null): { text: string | null; fromLens: boolean } {
  if (lensText) {
    return { text: compactText(lensText), fromLens: true };
  }

  const fields = [
    variation?.title,
    variation?.long_headline,
    variation?.headline,
  ];

  const text = compactText(
    fields.filter(value => typeof value === "string" && value.trim()).join(" ")
  );

  return { text: text || null, fromLens: false };
}

function buildVideoAdText(variation: any, transcriptText: string | null): string | null {
  if (transcriptText) {
    return compactText(transcriptText);
  }

  const fields = [
    variation?.title,
    variation?.long_headline,
    variation?.headline,
    variation?.description,
  ];

  const text = compactText(
    fields.filter(value => typeof value === "string" && value.trim()).join(" ")
  );

  return text || null;
}

function buildAdsTransparencyLink(advertiserId: string, creativeId: string, regionCode: string | null) {
  const region = regionCode || "US";
  return `https://adstransparency.google.com/advertiser/${advertiserId}/creative/${creativeId}?region=${region}`;
}

function formatCreativeCard({
  creative,
  formatLabel,
  adText,
  adTextLabel,
  iconUrl,
  imageUrl,
  youtubeLink,
  transparencyLink,
  warnings,
}: {
  creative: CreativeOutput;
  formatLabel: string;
  adText: string | null;
  adTextLabel: string;
  iconUrl: string | null;
  imageUrl: string | null;
  youtubeLink: string | null;
  transparencyLink: string | null;
  warnings: string[];
}) {
  const advertiser = creative.advertiser_name ?? "Unknown advertiser";
  const title = creative.name ?? "Untitled";
  const lines = [`## ${advertiser} — ${title}`];

  lines.push(`Advertiser: ${advertiser}`);
  if (formatLabel) {
    lines.push(`Format: ${formatLabel}`);
  }
  if (creative.last_seen) {
    lines.push(`Last shown: ${creative.last_seen}`);
  }
  if (creative.first_seen) {
    lines.push(`First shown: ${creative.first_seen}`);
  }
  if (iconUrl) {
    lines.push(`Icon: ${iconUrl}`);
  }
  if (imageUrl) {
    lines.push(`Image: ${imageUrl}`);
  }

  lines.push(`${adTextLabel}: *${adText || "Unavailable."}*`);

  if (youtubeLink) {
    lines.push(`YouTube: ${youtubeLink}`);
  }
  if (transparencyLink) {
    lines.push(`Ads Transparency: ${transparencyLink}`);
  }
  if (warnings.length) {
    lines.push(`Warnings: ${warnings.join(", ")}`);
  }

  return lines.join("\n");
}

function formatCreativeEmpty(message: string, warnings: string[]) {
  const lines = [message];
  if (warnings.length) {
    lines.push(`Warnings: ${warnings.join(", ")}`);
  }
  return lines.join("\n");
}

/* ============================================================================
   Tool Registration
   ============================================================================ */

export function registerFairCherTool(): ToolRegistry {
  return {
    /* ============================================================
       TOOL 0: ADVERTISER RESOLUTION
       ============================================================ */

    faircher_resolve_advertiser: {
      definition: {
        name: "faircher_resolve_advertiser",
        description:
          "Use this when the user gives a business/brand name (not a domain) and you need candidate advertisers/domains from Google Ads Transparency Center. Do not use when a valid apex domain is already provided.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description:
                "Business or brand keyword (not a domain). Examples: \"tesla\", \"midas\".",
            },
            region: {
              type: "string",
              description: "Region code such as \"US\" or \"CA\".",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
        },
      },

      async run(args: { query: string; region?: string }) {
        const warnings: string[] = [];
        const query = args.query?.trim();
        if (!query) {
          return wrapJson(buildToolError("invalid_query", "Query is required."));
        }

        try {
          const payload = await fetchAdvertiserSearch(query, args.region);
          const { advertisers, domains } = normalizeAdvertiserCandidates(payload);

          if (!advertisers.length && !domains.length) {
            warnings.push("no_candidates_found");
          }

          const recommendation = buildAdvertiserRecommendation({
            query,
            advertisers,
            domains,
          });

          return wrapJson({
            query,
            region: args.region ?? "anywhere",
            advertisers,
            domains,
            recommendation,
            warnings,
          });
        } catch (error) {
          return wrapJson(
            buildToolError("upstream_error", "Advertiser search unavailable", {
              cause: error instanceof Error ? error.message : "Unknown",
            })
          );
        }
      },
    },

    /* ============================================================
       TOOL 1: DOMAIN SNAPSHOT
       ============================================================ */

    faircher_domain_ads_summary: {
      definition: {
        name: "faircher_domain_ads_summary",
        description:
          "Use this when you need a cross-format (search/display/video) ads snapshot summary for a single domain over the last ~120 days. Do not use for single most-recent creatives, scheduling/reminders/email drafting, general web research, SEO advice, writing ad copy, budgeting, or campaign management.",
        inputSchema: {
          type: "object",
          required: ["domain"],
          properties: {
            domain: {
              type: "string",
              description:
                "Apex/root domain only (URLs allowed and normalized by stripping scheme/www/path). Examples: \"example.com\", \"https://www.example.com/pricing\".",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
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
          "Use this when you need the single most recent Search ad creative for a domain or advertiser keyword from the last ~60 days (returns at most 1, may be null). Do not use for aggregate summaries across formats (use the domain snapshot), scheduling/reminders/email drafting, general web research, SEO advice, or writing ad copy.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description:
                "Domain or advertiser keyword; domain-like values are normalized to apex/root, otherwise treated as a keyword and resolved to an advertiser/domain. Examples: \"nike.com\", \"Nike running shoes\".",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
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
          "Use this when you need the single most recent Display ad creative for a domain or advertiser keyword from the last ~60 days (returns at most 1, may be null). Do not use for aggregate summaries across formats (use the domain snapshot), scheduling/reminders/email drafting, general web research, SEO advice, or writing ad copy.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description:
                "Domain or advertiser keyword; domain-like values are normalized to apex/root, otherwise treated as a keyword and resolved to an advertiser/domain. Examples: \"adobe.com\", \"creative cloud\".",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
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
          "Use this when you need the single most recent Video ad creative for a domain or advertiser keyword from the last ~60 days (returns at most 1, may be null). Do not use for aggregate summaries across formats (use the domain snapshot), scheduling/reminders/email drafting, general web research, SEO advice, or writing ad copy.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description:
                "Domain or advertiser keyword; domain-like values are normalized to apex/root, otherwise treated as a keyword and resolved to an advertiser/domain. Examples: \"spotify.com\", \"music streaming\".",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
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
      return wrapText(formatCreativeEmpty(`No advertiser found for "${args.query}".`, warnings));
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
      return wrapText(formatCreativeEmpty(`No creatives found for "${args.query}".`, warnings));
    }

    const creativeId = creative.id ?? null;
    if (!creativeId) {
      warnings.push("missing_creative_id");
      return wrapText(formatCreativeEmpty("Creative unavailable.", warnings));
    }

    const advertiserId =
      creative.advertiser?.id ??
      (resolution.kind === "advertiser" ? resolution.advertiser_id : null);

    if (!advertiserId) {
      warnings.push("missing_advertiser_id");
      return wrapText(formatCreativeEmpty("Creative unavailable.", warnings));
    }

    const details = await fetchAdDetails(advertiserId, creativeId);
    const variation = details?.variations?.[0];

    if (!variation) {
      warnings.push("missing_ad_details_variation");
      return wrapText(formatCreativeEmpty("Creative details unavailable.", warnings));
    }

    const creativeOutput = buildCreativeOutput(
      creative,
      variation,
      formatLabel,
      resolution.kind === "advertiser" ? resolution.advertiser_name : null
    );

    const videoOutput =
      format === "video" ? await buildVideoOutput(variation, warnings) : null;
    const regionCode =
      details?.ad_information?.regions?.[0]?.code ?? null;
    const iconUrl = extractIconUrl(creative, details, variation);
    const transparencyLink = buildAdsTransparencyLink(advertiserId, creativeId, regionCode);
    let imageUrl: string | null = null;
    let lensText: string | null = null;

    if (format === "display") {
      imageUrl = extractImageUrl(variation);
      if (imageUrl) {
        try {
          const lensPayload = await fetchGoogleLens(imageUrl, regionCode ?? undefined);
          lensText = extractLensText(lensPayload);
          if (!lensText) {
            warnings.push("lens_no_text");
          }
        } catch (error) {
          warnings.push("lens_unavailable");
        }
      }
    }

    const adTextData =
      format === "search"
        ? { text: buildSearchAdText(variation), fromLens: false }
        : format === "display"
          ? buildDisplayAdText(variation, lensText)
          : { text: buildVideoAdText(variation, videoOutput?.transcript_text ?? null), fromLens: false };

    const adTextLabel = adTextData.fromLens
      ? "Ad text (best-effort, Lens)"
      : "Ad text";

    const youtubeLink =
      format === "video"
        ? (typeof variation?.video_link === "string" && isFullUrl(variation.video_link)
          ? variation.video_link
          : videoOutput?.youtube_video_id
            ? `https://www.youtube.com/watch?v=${videoOutput.youtube_video_id}`
            : null)
        : null;

    const card = formatCreativeCard({
      creative: creativeOutput,
      formatLabel,
      adText: adTextData.text,
      adTextLabel,
      iconUrl,
      imageUrl,
      youtubeLink,
      transparencyLink,
      warnings,
    });

    return wrapText(card);
  } catch (err) {
    if (err instanceof ValidationError) {
      return wrapText(`Error: ${err.message}`);
    }

    return wrapText(
      `Error: Creative fetch unavailable. ${err instanceof Error ? err.message : "Unknown"}`
    );
  }
}

/* ============================================================================
   Output helpers
   ============================================================================ */

function wrapText(payload: unknown) {
  if (typeof payload === "string") {
    return {
      content: [{ type: "text", text: payload }],
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function wrapJson(payload: unknown) {
  return {
    content: [{ type: "json", json: payload }],
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
