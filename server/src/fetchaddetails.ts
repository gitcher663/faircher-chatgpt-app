// server/src/fetchAdDetails.ts

export type AdRegion = {
  code: string;
  name: string;
  first_shown_date?: string;
  last_shown_date?: string;
};

export type AdInformation = {
  format: "text" | "image" | "video";
  topic?: string;
  first_shown_date?: string;
  last_shown_date?: string;
  last_shown_datetime?: string;
  regions?: AdRegion[];
};

export type AdVariation = {
  // Text ads
  title?: string;
  snippet?: string;
  displayed_link?: string;
  link?: string;

  // Image ads
  image?: string;
  images?: string[];

  // Video ads
  video_id?: string;
  video_link?: string;
  duration?: string;
  channel?: string;
  is_skippable?: boolean;

  // Shared
  domain?: string;
  call_to_action?: string;
};

export type AdDetailsResponse = {
  ad_information?: AdInformation;
  variations?: AdVariation[];
  error?: string;
};

const SEARCH_API_URL = "https://www.searchapi.io/api/v1/search";

export async function fetchAdDetails(args: {
  advertiserId: string; // ARxxxxxxxxxxxxxxxxxxxx
  creativeId: string;   // CRxxxxxxxxxxxxxxxxxxxx
}): Promise<AdDetailsResponse> {
  const apiKey = process.env.UPSTREAM_API_KEY;

  if (!apiKey) {
    throw new Error("Missing UPSTREAM_API_KEY");
  }

  const params = new URLSearchParams({
    engine: "google_ads_transparency_center_ad_details",
    advertiser_id: args.advertiserId,
    creative_id: args.creativeId
  });

  const response = await fetch(`${SEARCH_API_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Ad details request failed (${response.status}): ${text}`
    );
  }

  const json = (await response.json()) as AdDetailsResponse;

  if (json.error) {
    throw new Error(json.error);
  }

  return {
    ad_information: json.ad_information,
    variations: Array.isArray(json.variations) ? json.variations : []
  };
}
