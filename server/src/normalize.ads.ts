/**
 * normalize_ads.ts
 *
 * PURPOSE
 * -------
 * Converts upstream vendor payloads into normalized advertising signals.
 *
 * This module is:
 * - Vendor-aware (Google Ads Transparency, LinkedIn, etc.)
 * - Semantics-preserving (format + surface are explicit)
 * - Inference-free (no spend, no confidence, no weighting)
 *
 * OUTPUT
 * ------
 * NormalizedAdSignal[] suitable for ads_analysis.ts
 */

import type { UpstreamAdsPayload } from "./upstream";
import type {
  CanonicalAdFormat,
  AdSurface,
  NormalizedAdSignal,
} from "./ads_analysis";

/* ------------------------------------------------------------------
   Helpers
------------------------------------------------------------------ */

function normalizeDate(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Maps upstream ad_format + engine + platform context
 * into canonical (format, surface).
 *
 * This is the MOST IMPORTANT LOGIC IN THE SYSTEM.
 */
function mapFormatAndSurface(args: {
  engine?: string;
  ad_format?: string;
  platformHint?: string;
}): { format: CanonicalAdFormat; surface: AdSurface } {
  const engine = (args.engine ?? "").toLowerCase();
  const adFormat = (args.ad_format ?? "").toLowerCase();
  const platform = (args.platformHint ?? "").toLowerCase();

  /* -------------------------
     Search
  ------------------------- */
  if (adFormat === "text") {
    return {
      format: "Search",
      surface: "Search Network",
    };
  }

  /* -------------------------
     YouTube Video (explicit)
  ------------------------- */
  if (platform === "youtube") {
    return {
      format: "Video",
      surface: "YouTube",
    };
  }

  /* -------------------------
     Connected TV (explicit)
  ------------------------- */
  if (
    platform.includes("ctv") ||
    platform.includes("connected_tv") ||
    platform.includes("connected tv")
  ) {
    return {
      format: "CTV",
      surface: "Connected TV",
    };
  }

  /* -------------------------
     Programmatic Video
  ------------------------- */
  if (adFormat === "video") {
    return {
      format: "Video",
      surface: "Programmatic Video",
    };
  }

  /* -------------------------
     Display
  ------------------------- */
  if (adFormat === "image") {
    return {
      format: "Display",
      surface: "Programmatic Display",
    };
  }

  /* -------------------------
     Fallback
  ------------------------- */
  return {
    format: "Other",
    surface: "Other",
  };
}

/* ------------------------------------------------------------------
   Public API
------------------------------------------------------------------ */

type NormalizeAdsArgs = {
  upstream: UpstreamAdsPayload;
};

/**
 * normalizeAds
 *
 * Converts an UpstreamAdsPayload into NormalizedAdSignal[]
 */
export function normalizeAds({
  upstream,
}: NormalizeAdsArgs): NormalizedAdSignal[] {
  const engine = upstream.search_parameters?.engine;
  const adFormat = upstream.search_parameters?.ad_format;

  if (!Array.isArray(upstream.ad_creatives)) {
    return [];
  }

  const normalized: NormalizedAdSignal[] = [];

  for (const creative of upstream.ad_creatives) {
    const firstSeen = normalizeDate(creative.first_shown_datetime);
    const lastSeen = normalizeDate(creative.last_shown_datetime);

    if (!firstSeen || !lastSeen) {
      continue;
    }

    /**
     * Platform hint resolution
     * ------------------------
     * We infer platform ONLY from known upstream context.
     * No guessing. No heuristics.
     */
    let platformHint: string | undefined;

    if (
      upstream.search_parameters?.engine ===
        "google_ads_transparency_center" &&
      upstream.search_parameters?.platform === "youtube"
    ) {
      platformHint = "youtube";
    }

    // Future-proof: allow upstream to pass explicit platform
    if ((creative as any).platform) {
      platformHint = String((creative as any).platform);
    }

    const { format, surface } = mapFormatAndSurface({
      engine,
      ad_format: creative.format ?? adFormat,
      platformHint,
    });

    normalized.push({
      format,
      surface,
      first_seen: firstSeen,
      last_seen: lastSeen,
    });
  }

  return normalized;
}
