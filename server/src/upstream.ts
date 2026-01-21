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
  };
  search_information?: {
    total_results?: number;
  };
  ad_creatives?: Array<{
    id: string;
    format: "text" | "image" | "video";
    first_shown_datetime: string;
    last_shown_datetime: string;
    advertiser: {
      id: string;
      name: string;
    };
    target_domain?: string;
  }>;
  pagination?: {
    next_page_token?: string;
  };
};

type FetchArgs = {
  domain: string;
};

const SEARCH_API_URL = "https://www.searchapi.io/api/v1/search";

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

  const params = new URLSearchParams({
    engine: "google_ads_transparency_center",
    domain: args.domain,
    time_period: "last_30_days",
    num: "100",
    region: "ANYWHERE"
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
