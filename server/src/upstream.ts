import fetch from "node-fetch";

export type UpstreamAdsPayload = {
  search_metadata: {
    status: string;
    request_url: string;
  };
  search_parameters: {
    engine: string;
    domain?: string;
    advertiser_id?: string;
    time_period?: string;
  };
  search_information: {
    total_results: number;
  };
  ad_creatives: Array<{
    id: string;
    format: "text" | "image" | "video";
    first_shown_datetime: string;
    last_shown_datetime: string;
    advertiser: {
      id: string;
      name: string;
    };
  }>;
  pagination?: {
    next_page_token?: string;
  };
};

type FetchArgs = {
  domain: string;
};

const SEARCH_API_URL = "https://www.searchapi.io/api/v1/search";

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
  });

  const response = await fetch(
    `${SEARCH_API_URL}?${params.toString()}`,
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

  if (json.search_metadata?.status !== "Success") {
    throw new Error("SearchAPI returned non-success status");
  }

  return json;
}
