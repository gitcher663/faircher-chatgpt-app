/**
 * format_weight_engine.ts
 *
 * PURPOSE
 * -------
 * Converts normalized ad formats + platforms into a weighted activity score
 * and spend signal tier.
 *
 * This file is the ONLY place where:
 * - Video types are differentiated
 * - CTV > YouTube > Programmatic Video is enforced
 * - Signal stacking is evaluated
 *
 * No UI language. No sales phrasing.
 */

export type VideoSurface =
  | "youtube"
  | "programmatic_video"
  | "ctv";

export type FormatWeightInput = {
  formats: {
    search: number;
    display: number;
    youtube_video: number;
    programmatic_video: number;
    ctv: number;
  };
};

export type WeightedSpendSignal = {
  spend_level: "$" | "$$" | "$$$" | "$$$$";
  activity_score: number;
  signal_stack: Array<
    "Search" | "Display" | "YouTube Video" | "Programmatic Video" | "CTV"
  >;
};

/* ------------------------------------------------------------------ */
/* Weights (locked + opinionated)                                      */
/* ------------------------------------------------------------------ */

const WEIGHTS = {
  search: 1.0,
  display: 0.75,
  youtube_video: 2.0,
  programmatic_video: 2.5,
  ctv: 4.0,
};

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function computeWeightedSpendSignal(
  input: FormatWeightInput
): WeightedSpendSignal {
  const { formats } = input;

  let score = 0;
  const signal_stack: WeightedSpendSignal["signal_stack"] = [];

  if (formats.search > 0) {
    score += formats.search * WEIGHTS.search;
    signal_stack.push("Search");
  }

  if (formats.display > 0) {
    score += formats.display * WEIGHTS.display;
    signal_stack.push("Display");
  }

  if (formats.youtube_video > 0) {
    score += formats.youtube_video * WEIGHTS.youtube_video;
    signal_stack.push("YouTube Video");
  }

  if (formats.programmatic_video > 0) {
    score += formats.programmatic_video * WEIGHTS.programmatic_video;
    signal_stack.push("Programmatic Video");
  }

  if (formats.ctv > 0) {
    score += formats.ctv * WEIGHTS.ctv;
    signal_stack.push("CTV");
  }

  const spend_level: WeightedSpendSignal["spend_level"] =
    score < 5
      ? "$"
      : score < 15
      ? "$$"
      : score < 40
      ? "$$$"
      : "$$$$";

  return {
    spend_level,
    activity_score: Math.round(score * 10) / 10,
    signal_stack,
  };
}
