/* ============================================================================
   Time Decay Weighting
   ============================================================================ */

export type TimeDecayConfig = {
  half_life_days: number; // days until signal weight halves
  floor: number;          // minimum weight
};

const DEFAULT_DECAY: TimeDecayConfig = {
  half_life_days: 90,
  floor: 0.15,
};

export function applyTimeDecay(
  daysAgo: number,
  config: TimeDecayConfig = DEFAULT_DECAY
): number {
  if (daysAgo <= 0) return 1;

  const decay =
    Math.pow(0.5, daysAgo / config.half_life_days);

  return Math.max(decay, config.floor);
}
