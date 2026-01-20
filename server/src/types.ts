export type AdsSummaryResponse = {
  domain: string;
  summary: {
    is_running_ads: boolean;
    total_ads_found: number;
    active_advertisers: number;
    primary_advertiser: string | null;
    confidence: number;
  };
  activity: {
    first_seen: string;
    last_seen: string;
    is_recent: boolean;
    ad_lifespan_days: number;
  } | null;
  distribution: {
    formats: {
      text?: number;
      image?: number;
      video?: number;
    };
  } | null;
  advertisers: Array<{
    name: string;
    advertiser_id: string;
    ad_count_estimate: number;
    is_primary: boolean;
  }>;
  metadata: {
    data_window: string;
    source: string;
  };
  _meta?: {
    "openai/outputTemplate": string;
  };
};

export type ToolInput = {
  domain: string;
};
