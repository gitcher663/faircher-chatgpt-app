import { normalizeDomain } from "./normalize";
import { normalizeTimePeriod } from "./time_period";

export type UpstreamAdsPayload = {
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
};

const SEARCH_API_URL = "https://www.searchapi.io/api/v1/search";
const DEFAULT_PAGE_LIMIT = 10;

function normalizeStatus(status?: string): string {
  return (status ?? "").trim().toLowerCase();
}

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
    region: "US"
  });

  const response = await fetch(`${SEARCH_API_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SearchAPI request failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as UpstreamAdsPayload;

  const status = normalizeStatus(json.search_metadata?.status);
  if (status && status !== "success") {
    throw new Error(
      `SearchAPI returned non-success status: ${json.search_metadata?.status}`
    );
  }

  if (!Array.isArray(json.ad_creatives)) {
    json.ad_creatives = [];
  }

  if (!json.search_metadata && json.ad_creatives.length === 0) {
    throw new Error(
      "SearchAPI payload missing expected fields (no metadata, no ads)"
    );
  }

  return json;
}

type SearchParams = Record<string, string | number | undefined>;

export async function fetchAllPages(
  baseUrl: string,
  params: SearchParams
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
      if (value === undefined) continue;
      searchParams.set(key, String(value));
    }
    if (nextPageToken) {
      searchParams.set("page_token", nextPageToken);
    }

    const response = await fetch(`${baseUrl}?${searchParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `SearchAPI request failed (${response.status}): ${text}`
      );
    }

    const json = (await response.json()) as UpstreamAdsPayload;
    pages.push(json);

    const status = normalizeStatus(json.search_metadata?.status);
    if (status && status !== "success") {
      throw new Error(
        `SearchAPI returned non-success status: ${json.search_metadata?.status}`
      );
    }

    nextPageToken = json.pagination?.next_page_token;
    if (!nextPageToken) {
      break;
    }
  }

  return pages;
}
