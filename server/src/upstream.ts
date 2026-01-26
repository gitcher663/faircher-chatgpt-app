import { normalizeDomain } from "./normalize";
import { normalizeTimePeriod } from "./time_period";

/**
 * upstream.ts
 *
 * PURPOSE
 * -------
 * Fetches vendor advertising payloads and attaches
 * explicit platform intent for downstream normalization.
 *
 * This file is:
 * - Vendor-aware
 * - Platform-aware
 * - Inference-free
 *
 * It MUST be the only place where platform intent is defined.
 */

export type PlatformHint =
  | "youtube"
  | "programmatic"
  | "ctv"
  | "unknown";

export type UpstreamAdsPayload = {
  /** 🔑 Added explicitly by fetch layer */
  platform_hint?: PlatformHint;

  search_metadata?: {
    status?: string;
    request_url?: string;
  };

  search_parameters?: {
    engine?: string;
    domain?: string;
    advertiser_id?: string;
    time_period?: string;
    ad_format?: "text" | "image" | "video" | "all";
    platform?: string;
  };

  search_information?: {
    total_results?: number;
  };

  ad_creatives?: Array<{
    id?: string;
    format?: "text" | "image" | "video";
    first_shown_datetime?: string;
    last_shown_datetime?: string;
    advertiser?: {
      id?: string;
      name?: string;
    };
    target_domain?: string;
    details_link?: string;
  }>;

  pagination?: {
    next_page_token?: string;
  };
};

type FetchArgs = {
  domain: string;

  /**
   * Explicit platform intent.
   * MUST be set by caller.
   */
  platform_hint?: PlatformHint;
};

const SEARCH_API_URL = "https://www.searchapi.io/api/v1/search";
const DEFAULT_PAGE_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

/* ------------------------------------------------------------------
   Helpers
------------------------------------------------------------------ */

function normalizeStatus(status?: string): string {
  return (status ?? "").trim().toLowerCase();
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  }: { timeoutMs?: number; retries?: number; retryDelayMs?: number } = {}
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      if (!response.ok && shouldRetryStatus(response.status)) {
        lastError = new Error(`Retryable status ${response.status}`);
      } else {
        return response;
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Unknown fetch error");
    } finally {
      clearTimeout(timeoutId);
    }

    if (attempt < retries) {
      await new Promise(resolve =>
        setTimeout(resolve, retryDelayMs * (attempt + 1))
      );
    }
  }

  throw lastError ?? new Error("Upstream request failed");
}

/* ------------------------------------------------------------------
   Single-page fetch
------------------------------------------------------------------ */

export async function fetchUpstreamAds(
  args: FetchArgs
): Promise<UpstreamAdsPayload> {
  const apiKey = process.env.UPSTREAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing UPSTREAM_API_KEY");
  }

  const domain = normalizeDomain(args.domain);

  const params = new URLSearchParams({
    engine: "google_ads_transparency_center",
    domain,
    time_period: normalizeTimePeriod("last_365_days"),
    num: "100",
    region: "US",
  });

  const response = await fetchWithRetry(
    `${SEARCH_API_URL}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SearchAPI request failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as UpstreamAdsPayload;

  /** ✅ Attach platform intent HERE */
  json.platform_hint = args.platform_hint ?? "unknown";

  const status = normalizeStatus(json.search_metadata?.status);
  if (status && status !== "success") {
    throw new Error(
      `SearchAPI returned non-success status: ${json.search_metadata?.status}`
    );
  }

  if (!Array.isArray(json.ad_creatives)) {
    json.ad_creatives = [];
  }

  return json;
}

/* ------------------------------------------------------------------
   Paginated fetch
------------------------------------------------------------------ */

type SearchParams = Record<string, string | number | undefined>;

export async function fetchAllPages(
  baseUrl: string,
  params: SearchParams,
  platform_hint: PlatformHint = "unknown"
): Promise<UpstreamAdsPayload[]> {
  const apiKey = process.env.UPSTREAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing UPSTREAM_API_KEY");
  }

  const pages: UpstreamAdsPayload[] = [];
  let nextPageToken: string | undefined;

  for (let page = 0; page < DEFAULT_PAGE_LIMIT; page += 1) {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }

    if (nextPageToken) {
      searchParams.set("page_token", nextPageToken);
    }

    const response = await fetchWithRetry(
      `${baseUrl}?${searchParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `SearchAPI request failed (${response.status}): ${text}`
      );
    }

    const json = (await response.json()) as UpstreamAdsPayload;

    /** ✅ Attach platform intent to every page */
    json.platform_hint = platform_hint;

    const status = normalizeStatus(json.search_metadata?.status);
    if (status && status !== "success") {
      throw new Error(
        `SearchAPI returned non-success status: ${json.search_metadata?.status}`
      );
    }

    pages.push(json);

    nextPageToken = json.pagination?.next_page_token;
    if (!nextPageToken) break;
  }

  return pages;
}
