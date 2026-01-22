import type { UpstreamAdsPayload } from "./upstream";
import { normalizeDomain } from "./normalize";
import { normalizeTimePeriod } from "./time_period";

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

  const adFormat = args.adFormat;
  if (!["text", "image", "video"].includes(adFormat)) {
    throw new Error(`Invalid ad_format: ${adFormat}`);
  }

  const domain = normalizeDomain(args.domain);
  const cappedNum = Math.min(Math.max(args.num ?? 100, 1), 100);

  const params = new URLSearchParams({
    engine: "google_ads_transparency_center",
    domain,
    time_period: normalizeTimePeriod("last_365_days"),
    ad_format: adFormat,
    num: String(cappedNum),
    region: "US",
  });

  const requestUrl = `${SEARCH_API_URL}?${params.toString()}`;
  const response = await fetch(requestUrl, {
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
  const upstreamFormat = json.search_parameters?.ad_format;
  if (upstreamFormat && upstreamFormat !== adFormat) {
    throw new Error(
      `SearchAPI ad_format mismatch: requested ${adFormat}, received ${upstreamFormat} (request: ${requestUrl})`
    );
  }

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
