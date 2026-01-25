/* ============================================================================
   Spend Symbol Mapper (Reporting Layer)
   ============================================================================ */

export type SpendSymbol = "$" | "$$" | "$$$" | "$$$$";

export function mapScoreToSpendSymbol(
  score: number
): SpendSymbol {
  if (score >= 75) return "$$$$";
  if (score >= 50) return "$$$";
  if (score >= 25) return "$$";
  return "$";
}
