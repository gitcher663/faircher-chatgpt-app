# UI Spec — FairCher Ads Summary

## Purpose

The UI is a standalone Vite + React application rendered inside ChatGPT.
It is responsible only for presenting the advertising summary returned by the MCP server.

All business logic and data aggregation are handled server-side.

---

## Data Source (Authoritative)

The UI MUST consume data exclusively from:

window.openai.toolOutput

The tool output conforms to the `faircher_domain_ads_summary` schema.

The UI MUST NOT:
- Fetch data directly
- Call external APIs
- Recompute summary metrics
- Mutate business data

---

## Expected Data Shape

```ts
type AdsSummaryOutput = {
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
};
