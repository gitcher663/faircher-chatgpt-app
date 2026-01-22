# UI Spec — FairCher Ads Summary

## Purpose

The UI is a standalone Vite + React application rendered inside ChatGPT.

It is responsible only for presenting the advertising summary returned by the MCP server.

All business logic and data aggregation are handled server-side.

---

## Data Source (Authoritative)

The UI MUST consume data exclusively from:

`window.openai.toolOutput`

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
  advertising_activity_snapshot: {
    status: "Active" | "Inactive" | "Inactive (Historical Buyer)";
    confidence_level: "Low" | "Medium" | "High";
    analysis_window_days: number;
    region: string;
    sales_signal_strength: "Weak" | "Moderate" | "Strong";
    total_ads_detected: number;
  };
  advertising_behavior_profile: {
    advertising_intensity: "Low" | "Moderate" | "High";
    strategy_orientation: "Performance-driven" | "Brand-led" | "Mixed";
    campaign_continuity: "Short-term" | "Long-running";
    format_sophistication: "Low" | "Moderate" | "High";
    experimentation_level: "Limited" | "Moderate" | "Aggressive";
  };
  activity_timeline: {
    first_observed: string | null;
    most_recent_activity: string | null;
    ad_longevity_days: number | null;
    always_on_presence: "Yes" | "No";
  };
  ad_format_mix: Array<{
    format: "Search Ads" | "Display Ads" | "Video Ads" | "Other Ads";
    count: number;
    share: number;
  }>;
  campaign_stability_signals: {
    average_ad_lifespan_days: number | null;
    creative_rotation: "Low" | "Moderate" | "High";
    burst_activity_detected: "Yes" | "No";
    volatility_index: "Low" | "Medium" | "High";
  };
  advertiser_scale: {
    scale_classification: "Local" | "Regional" | "National";
    geographic_focus: "Single-market" | "Multi-market" | "Nationwide";
    buying_complexity: "Simple" | "Moderate" | "Advanced";
  };
  estimated_monthly_media_spend: {
    spend_tier:
      | "$500 – $10,000 / month"
      | "$10,001 – $20,000 / month"
      | "$20,001 – $100,000 / month"
      | "$100,000+ / month";
  };
  spend_adequacy: {
    relative_investment_level:
      | "Underinvested"
      | "Appropriately Invested"
      | "Overextended";
    consistency_vs_scale: "Low" | "Moderate" | "High";
    growth_headroom: "Limited" | "Moderate" | "Significant";
  };
  spend_posture: {
    commitment_level: "Experimental" | "Sustained" | "Aggressive";
    scaling_pattern: "Flat" | "Seasonal" | "Accelerating";
    risk_profile: "Conservative" | "Balanced" | "Aggressive";
  };
  sales_interpretation: {
    sell_with_opportunity: string;
    sell_against_opportunity: string;
    outreach_recommendation: string;
  };
  data_scope: {
    geography: string;
    lookback_window_days: number;
    source: string;
  };
};
```

---

## Rendering Rules

### Empty State

If `advertising_activity_snapshot.status === "Inactive"`:

- Render `<EmptyState />`
- Render no other components

---

### Summary

When ads are present:

- Render `<AdsSummaryCard />`
- Display snapshot, format mix, stability, and scale/spend summaries.

---

### Distribution

Render `<DistributionBar />` to show canonical format counts and share.

---

## UI State

The UI MAY store ephemeral UI state (expanded sections, sort toggles) using:

```
window.openai.widgetState
window.openai.setWidgetState()
```

Business data MUST NOT be stored in widget state.

---

## Visual Design Guidelines

- Use system fonts only
- Clear vertical hierarchy
- Optimized for inline display
- No nested scrolling
- No dashboards or multi-tab layouts

---

## Accessibility Requirements

- WCAG AA color contrast
- Semantic HTML wh
