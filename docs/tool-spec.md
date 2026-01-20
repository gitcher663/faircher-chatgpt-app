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

## Output Schema — Advertising Activity Summary

The MCP server returns structured JSON matching the shared schema in
`server/src/types.ts` and `ui/src/types.ts`.

The response is deterministic, does **not** expose creative-level data, and is valid even
when no ads are found.

```json
{
  "domain": "example.com",
  "summary": {
    "is_running_ads": true,
    "total_ads_found": 42,
    "active_advertisers": 3,
    "primary_advertiser": "Example Corp",
    "confidence": 0.87
  },
  "activity": {
    "first_seen": "2024-01-10",
    "last_seen": "2024-02-20",
    "is_recent": true,
    "ad_lifespan_days": 41
  },
  "distribution": {
    "formats": {
      "text": 12,
      "image": 24,
      "video": 6
    }
  },
  "advertisers": [
    {
      "name": "Example Corp",
      "advertiser_id": "adv_123",
      "ad_count_estimate": 30,
      "is_primary": true
    }
  ],
  "metadata": {
    "data_window": "2024-01-01..2024-02-20",
    "source": "TODO"
  }
}
```

Field notes:

- `domain`: Normalized apex domain.
- `summary`: High-level metrics for the domain.
- `activity`: Timing information for observed ads. `null` when no ads are found.
- `distribution`: Aggregated distribution of ad formats. `null` when no ads are found.
- `advertisers`: List of advertisers with aggregated counts; empty array when no ads are found.
- `metadata`: Data provenance and window information.

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
