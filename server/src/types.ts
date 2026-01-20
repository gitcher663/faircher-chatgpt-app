export interface AdsSummaryResponse {
  domain: string;
  summary: Summary;
  activity: Activity | null;
  distribution: Distribution | null;
  advertisers: Advertiser[];
  metadata: Metadata;
}

export interface Summary {
  is_running_ads: boolean;
  total_ads_found: number;
  active_advertisers: number;
  primary_advertiser: string | null;
  confidence: number;
}

export interface Activity {
  first_seen: string;
  last_seen: string;
  is_recent: boolean;
  ad_lifespan_days: number;
}

export interface Distribution {
  formats: Record<"text" | "image" | "video", number>;
}

export interface Advertiser {
  name: string;
  advertiser_id: string;
  ad_count_estimate: number;
  is_primary: boolean;
}

export interface Metadata {
  data_window: string;
  source: string;
}

export interface ToolInput {
  domain: string;
}
