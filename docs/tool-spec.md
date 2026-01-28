# MCP Tool Spec

## Tool name

`faircher_domain_ads_summary`

## Input Contract — Domain Normalization & Validation

The tool accepts a single required input:

```json
{
  "domain": "string"
}
```

Validation and normalization rules:

- `domain` **must** be a normalized apex/root domain only.
- URLs, paths, and protocols are normalized to the apex domain.
  - Example: `https://www.example.com/path` → `example.com`.
- Subdomains are rejected.
  - Example: `ads.example.com` → **invalid_domain**.
- Invalid domains return a structured error response (see **Error Contract**).

## Output Schema — Advertising Activity Summary (Seller View)

The MCP server returns structured JSON matching the shared schema in
`server/src/summary_builder.ts` and `ui/src/types.ts`.

The response is deterministic, does **not** expose advertiser or creative data, and is valid even
when no ads are found. All signals are scoped to the last 365 days in the United States.

```json
{
  "domain": "example.com",
  "advertising_activity_snapshot": {
    "status": "Active",
    "confidence_level": "High",
    "analysis_window_days": 365,
    "region": "US",
    "sales_signal_strength": "Strong",
    "total_ads_detected": 42
  },
  "advertising_behavior_profile": {
    "advertising_intensity": "High",
    "strategy_orientation": "Mixed",
    "campaign_continuity": "Long-running",
    "format_sophistication": "High",
    "experimentation_level": "Moderate"
  },
  "activity_timeline": {
    "first_observed": "2024-01-10",
    "most_recent_activity": "2024-12-15",
    "ad_longevity_days": 340,
    "always_on_presence": "Yes"
  },
  "ad_format_mix": [
    { "format": "Search Ads", "count": 12, "share": 28.6 },
    { "format": "Display Ads", "count": 24, "share": 57.1 },
    { "format": "Video Ads", "count": 6, "share": 14.3 }
  ],
  "campaign_stability_signals": {
    "average_ad_lifespan_days": 42,
    "creative_rotation": "Moderate",
    "burst_activity_detected": "No",
    "volatility_index": "Low"
  },
  "advertiser_scale": {
    "scale_classification": "Regional",
    "geographic_focus": "Multi-market",
    "buying_complexity": "Moderate"
  },
  "estimated_monthly_media_spend": {
    "spend_tier": "$20,001 – $100,000 / month"
  },
  "spend_adequacy": {
    "relative_investment_level": "Appropriately Invested",
    "consistency_vs_scale": "High",
    "growth_headroom": "Moderate"
  },
  "spend_posture": {
    "commitment_level": "Sustained",
    "scaling_pattern": "Flat",
    "risk_profile": "Balanced"
  },
  "sales_interpretation": {
    "sell_with_opportunity": "Position as a regional buyer with $20,001 – $100,000 / month signals and moderate format depth.",
    "sell_against_opportunity": "Highlight competitive coverage gaps when activity shifts always-on and reinforce share-of-voice protection.",
    "outreach_recommendation": "Package inventory bundles matched to regional scale, balancing always-on coverage with flexible bursts."
  },
  "data_scope": {
    "geography": "United States",
    "lookback_window_days": 365,
    "source": "Google Ads Transparency Center"
  }
}
```

Field notes:

- `domain`: Normalized apex domain.
- `advertising_activity_snapshot`: Top-line activity signals scoped to 365 days (US).
- `advertising_behavior_profile`: Qualitative profile for sales qualification.
- `activity_timeline`: First/most-recent activity and continuity.
- `ad_format_mix`: Canonical format counts and share (%).
- `campaign_stability_signals`: Rotation and volatility indicators.
- `advertiser_scale`: Inferred scale and buying complexity.
- `estimated_monthly_media_spend`: Tiered spend estimate.
- `spend_adequacy`: Investment alignment relative to scale.
- `spend_posture`: Commitment and risk posture.
- `sales_interpretation`: Seller-facing guidance.
- `data_scope`: Geography, lookback, and source metadata.

## Error Contract

Errors are returned as structured JSON with a machine-readable `code` and human-readable
`message`.

### `invalid_domain`

Returned when the input fails validation (e.g., subdomain supplied or not a valid domain).

```json
{
  "error": {
    "code": "invalid_domain",
    "message": "Domain must be a valid apex domain.",
    "details": {
      "domain": "ads.example.com"
    }
  }
}
```

### `upstream_error`

Returned when upstream data sources fail or return invalid data.

```json
{
  "error": {
    "code": "upstream_error",
    "message": "Upstream ads service unavailable.",
    "details": {
      "retryable": true
    }
  }
}
```

## Creative tools (Search, Display, Video)

These tools return the single most recent creative per format. Outputs are extraction-only (no insights or speculation). All fields are sourced directly from upstream payloads. Missing fields are returned as `null` with warnings where relevant.

### `faircher_search_ad_creative`

**Input schema**

```json
{
  "query": "string"
}
```

**Output schema**

```json
{
  "query": "string",
  "format": "search",
  "creative": {
    "id": "string | null",
    "name": "string | null",
    "ad_format": "Search Ads",
    "advertiser_name": "string | null",
    "first_seen": "string | null",
    "last_seen": "string | null",
    "days_active": "number | null",
    "call_to_action": "string | null",
    "landing_url": "string | null",
    "landing_domain": "string | null"
  },
  "video": null,
  "source": "google_ads_transparency_center",
  "warnings": ["string"]
}
```

**Example JSON-RPC call**

```json
{
  "jsonrpc": "2.0",
  "id": "search-creative-1",
  "method": "tools/call",
  "params": {
    "name": "faircher_search_ad_creative",
    "arguments": {
      "query": "example.com"
    }
  }
}
```

### `faircher_display_ad_creative`

**Input schema**

```json
{
  "query": "string"
}
```

**Output schema**

```json
{
  "query": "string",
  "format": "display",
  "creative": {
    "id": "string | null",
    "name": "string | null",
    "ad_format": "Display Ads",
    "advertiser_name": "string | null",
    "first_seen": "string | null",
    "last_seen": "string | null",
    "days_active": "number | null",
    "call_to_action": "string | null",
    "landing_url": "string | null",
    "landing_domain": "string | null"
  },
  "video": null,
  "source": "google_ads_transparency_center",
  "warnings": ["string"]
}
```

**Example JSON-RPC call**

```json
{
  "jsonrpc": "2.0",
  "id": "display-creative-1",
  "method": "tools/call",
  "params": {
    "name": "faircher_display_ad_creative",
    "arguments": {
      "query": "acme apparel"
    }
  }
}
```

### `faircher_video_ad_creative`

**Input schema**

```json
{
  "query": "string"
}
```

**Output schema**

```json
{
  "query": "string",
  "format": "video",
  "creative": {
    "id": "string | null",
    "name": "string | null",
    "ad_format": "Video Ads",
    "advertiser_name": "string | null",
    "first_seen": "string | null",
    "last_seen": "string | null",
    "days_active": "number | null",
    "call_to_action": "string | null",
    "landing_url": "string | null",
    "landing_domain": "string | null"
  },
  "video": {
    "youtube_video_id": "string | null",
    "transcript_status": "ok | unavailable | timeout",
    "transcript_text": "string | null",
    "video_length_seconds": "number | null"
  },
  "source": "google_ads_transparency_center",
  "warnings": ["string"]
}
```

**Example JSON-RPC call**

```json
{
  "jsonrpc": "2.0",
  "id": "video-creative-1",
  "method": "tools/call",
  "params": {
    "name": "faircher_video_ad_creative",
    "arguments": {
      "query": "example.com"
    }
  }
}
```
