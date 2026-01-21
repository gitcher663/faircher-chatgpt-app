// server/src/fetchAdvertiserSearch.ts

export type AdvertiserSearchResult = {
  name: string;
  id: string; // ARxxxxxxxxxxxxxxxxxxxx
  region: string;
  ads_count: {
    lower: number;
    upper: number;
  };
  is_verified?: boolean;
};

export type AdvertiserSearchResponse = {
  search_metadata?: {
    status?: string;
    request_url?: string;
  };
  advertisers?: AdvertiserSearchResult[];
};

const SEARCH_API_URL = "https://www.searchapi.io/api/v1/search";

function normalizeStatus(status?: string): string {
  return (status ?? "").trim().toLowerCase();
}

export async function fetchAdvertiserSearch(query: string): Promise<AdvertiserSearchResult[]> {
  const apiKey = process.env.UPSTREAM_API_KEY;

  if (!apiKey) {
    throw new Error("Missing UPSTREAM_API_KEY");
  }

  const params = new URLSearchParams({
    engine: "google_ads_transparency_center_advertiser_search",
    q: query,
    region: "ANYWHERE",
    num_advertisers: "5",
    num_domains: "0"
  });

  const response = await fetch(`${SEARCH_API_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Advertiser search failed (${response.status}): ${text}`
    );
  }

  const json = (await response.json()) as AdvertiserSearchResponse;

  const status = normalizeStatus(json.search_metadata?.status);
  if (status && status !== "success") {
    throw new Error(
      `Advertiser search returned non-success status: ${json.search_metadata?.status}`
    );
  }

  if (!Array.isArray(json.advertisers)) {
    return [];
  }

  return json.advertisers;
}
