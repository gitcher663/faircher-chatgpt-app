import type { CanonicalAdFormat } from "./ads_analysis";

/* ============================================================================
   Canonical format groups
   ============================================================================ */

/**
 * These map 1:1 with how you ingest data today.
 * Do NOT collapse these — separation is the signal.
 */
export type WeightedAdChannel =
  | "Search"
  | "Display"
  | "YouTubeVideo"
  | "ProgrammaticVideo"
  | "CTV";

/* ============================================================================
   Base weights (relative, not dollars)
   ============================================================================ */

/**
 * These weights reflect *buying power*, not impression volume.
 * They are intentionally conservative and tunable.
 */
export const BASE_CHANNEL_WEIGHTS: Record<WeightedAdChannel, number> = {
  Search: 0.5,
  Display: 0.6,
  ProgrammaticVideo: 1.0,
  YouTubeVideo: 1.2,
  CTV: 1.6,
};

/* ============================================================================
   Stack multipliers (this is the real signal)
   ============================================================================ */

export function stackMultiplier(channels: Set<WeightedAdChannel>): number {
  const hasCTV = channels.has("CTV");
  const hasYT = channels.has("YouTubeVideo");
  const hasVideo = channels.has("ProgrammaticVideo");

  // Enterprise-grade signal
  if (hasCTV && hasYT && hasVideo) return 1.6;

  // Strong upper-mid signal
  if ((hasCTV && hasVideo) || (hasCTV && hasYT)) return 1.4;

  // Solid video buyer
  if (hasVideo && hasYT) return 1.25;

  // Single-channel only
  return 1.0;
}

/* ============================================================================
   Public scoring API
   ============================================================================ */

export type FormatWeightInput = {
  /**
   * Count of ads per canonical format.
   * Example:
   * {
   *   "Search Ads": 12,
   *   "Video Ads": 8,
   *   "CTV Ads": 4
   * }
   */
  formats: Record<CanonicalAdFormat, number>;

  /**
   * Optional explicit channel flags if upstream provides them
   * (e.g. BuiltWith, pixel detection).
   */
  detected_channels?: WeightedAdChannel[];
};

export type FormatWeightResult = {
  weighted_score: number;
  normalized_level: "$" | "$$" | "$$$" | "$$$$";
  channels_detected: WeightedAdChannel[];
  stack_multiplier: number;
};

/* ============================================================================
   Core engine
   ============================================================================ */

export function computeFormatWeightedSpend(
  input: FormatWeightInput
): FormatWeightResult {
  const channels = new Set<WeightedAdChannel>();

  // Infer channels from canonical formats
  if (input.formats["Search Ads"] > 0) channels.add("Search");
  if (input.formats["Display Ads"] > 0) channels.add("Display");
  if (input.formats["Video Ads"] > 0) channels.add("ProgrammaticVideo");
  if (input.formats["YouTube Ads"] > 0) channels.add("YouTubeVideo");
  if (input.formats["CTV Ads"] > 0) channels.add("CTV");

  // Merge explicit detections (BuiltWith, pixels, etc.)
  input.detected_channels?.forEach(c => channels.add(c));

  // Base weighted score
  let score = 0;
  for (const channel of channels) {
    score += BASE_CHANNEL_WEIGHTS[channel];
  }

  // Apply stack multiplier
  const multiplier = stackMultiplier(channels);
  const weightedScore = Number((score * multiplier).toFixed(2));

  return {
    weighted_score: weightedScore,
    normalized_level: normalizeSpendLevel(weightedScore),
    channels_detected: Array.from(channels),
    stack_multiplier: multiplier,
  };
}

/* ============================================================================
   Normalization (relative tiers only)
   ============================================================================ */

/**
 * IMPORTANT:
 * These thresholds are intentionally coarse.
 * Dollar mapping happens later, only in forecasting mode.
 */
function normalizeSpendLevel(score: number): "$" | "$$" | "$$$" | "$$$$" {
  if (score < 1.0) return "$";
  if (score < 2.2) return "$$";
  if (score < 3.5) return "$$$";
  return "$$$$";
}
