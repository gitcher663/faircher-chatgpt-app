/* ============================================================================
   Advertising Intelligence Weights
   ----------------------------------------------------------------------------
   Purpose:
   - Centralized, opinionated weighting for spend inference
   - No dollar claims
   - Used ONLY for relative scoring and confidence adjustment
   ============================================================================ */

/* ============================================================================
   Types
   ============================================================================ */

export type AdFormat =
  | "Search Ads"
  | "Display Ads"
  | "Video Ads"
  | "CTV Ads"
  | "Other Ads";

export type Platform =
  | "google"
  | "youtube"
  | "meta"
  | "linkedin"
  | "tiktok"
  | "ctv"
  | "other";

export type BusinessSize = "SMB" | "Mid-market" | "Enterprise";

export type Vertical =
  | "finance"
  | "saas"
  | "ecommerce"
  | "travel"
  | "local_services"
  | "nonprofit"
  | "other";

/* ============================================================================
   1. Format Weights
   ----------------------------------------------------------------------------
   Relative cost / effort pressure per ad format
   ============================================================================ */

export const FORMAT_WEIGHTS: Record<AdFormat, number> = {
  "Search Ads": 1.0,
  "Display Ads": 1.2,
  "Video Ads": 2.0,
  "CTV Ads": 3.0,
  "Other Ads": 1.0,
};

/* ============================================================================
   2. Platform Modifiers
   ----------------------------------------------------------------------------
   Auction pressure + typical CPM differences
   ============================================================================ */

export const PLATFORM_MODIFIERS: Record<Platform, number> = {
  google: 1.0,
  youtube: 1.3,
  meta: 1.2,
  linkedin: 1.8,
  tiktok: 1.4,
  ctv: 2.2,
  other: 1.0,
};

/* ============================================================================
   3. Vertical Cost Pressure
   ----------------------------------------------------------------------------
   Used to adjust inferred spend pressure and confidence
   ============================================================================ */

export const VERTICAL_COST_PRESSURE: Record<Vertical, number> = {
  finance: 1.25,
  saas: 1.2,
  ecommerce: 1.1,
  travel: 1.15,
  local_services: 0.9,
  nonprofit: 0.8,
  other: 1.0,
};

/* ============================================================================
   4. Business Size Sanity Rules
   ----------------------------------------------------------------------------
   Used ONLY for confidence adjustment and plausibility checks
   ============================================================================ */

export const BUSINESS_SIZE_RULES: Record<
  BusinessSize,
  {
    maxSpendLevel: "$" | "$$" | "$$$" | "$$$$";
    minSpendLevel: "$" | "$$" | "$$$" | "$$$$";
  }
> = {
  SMB: {
    minSpendLevel: "$",
    maxSpendLevel: "$$$",
  },
  "Mid-market": {
    minSpendLevel: "$$",
    maxSpendLevel: "$$$",
  },
  Enterprise: {
    minSpendLevel: "$$",
    maxSpendLevel: "$$$$",
  },
};

/* ============================================================================
   5. Helper Functions
   ============================================================================ */

/**
 * Computes a weighted activity score for a set of ads.
 * This is the CORE input to spend inference.
 */
export function computeWeightedActivityScore(input: {
  format: AdFormat;
  platform: Platform;
  count: number;
  vertical?: Vertical;
}[]): number {
  return input.reduce((sum, row) => {
    const formatWeight = FORMAT_WEIGHTS[row.format] ?? 1.0;
    const platformModifier = PLATFORM_MODIFIERS[row.platform] ?? 1.0;
    const verticalPressure = row.vertical
      ? VERTICAL_COST_PRESSURE[row.vertical] ?? 1.0
      : 1.0;

    return (
      sum +
      row.count * formatWeight * platformModifier * verticalPressure
    );
  }, 0);
}

/**
 * Maps a weighted score to a symbolic spend level.
 * Symbols only — no dollars.
 */
export function scoreToSpendLevel(
  score: number
): "$" | "$$" | "$$$" | "$$$$" {
  if (score < 10) return "$";
  if (score < 30) return "$$";
  if (score < 80) return "$$$";
  return "$$$$";
}

/**
 * Adjusts confidence based on business size plausibility.
 */
export function adjustConfidenceForBusinessSize(
  spendLevel: "$" | "$$" | "$$$" | "$$$$",
  businessSize: BusinessSize
): "Low" | "Medium" | "High" {
  const rules = BUSINESS_SIZE_RULES[businessSize];

  if (
    spendLevel < rules.minSpendLevel ||
    spendLevel > rules.maxSpendLevel
  ) {
    return "Low";
  }

  if (spendLevel === rules.minSpendLevel || spendLevel === rules.maxSpendLevel) {
    return "Medium";
  }

  return "High";
}
