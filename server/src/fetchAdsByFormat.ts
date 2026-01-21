import type { UpstreamAdsPayload } from "./upstream";

export type AdFormat = "text" | "image" | "video";

type FetchAdsByFormatArgs = {
  domain: string;
  adFormat: AdFormat;
  num?: number;
};

const SEARCH_API_URL = "https://www.searchapi.io/api/v1/search";

function normalizeStatus(status?: string): string {
  return (status ?? "").trim().toLowerCase();
}

export async function fetchAdsByFormat(
  args: FetchAdsByFormatArgs
): Promise<UpstreamAdsPayload> {
  const apiKey = process.env.UPSTREAM_API_KEY;
  if (!apiKey) throw new Error("Missing UPSTREAM_API_KEY");

  const params = new URLSearchParams({
    engine: "google_ads_transparency_center",
    domain: args.domain,
    time_period: "last_30_days",
    ad_format: args.adFormat,
    num: String(args.num ?? 40),
    region: "ANYWHERE",
  });

  const response = await fetch(`${SEARCH_API_URL}?${params.toString()}`, {
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
