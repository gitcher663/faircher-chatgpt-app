import type { SellerSummary, FormatSpecificSummary } from "./summary_builder";

export type AdsSummaryResponse = SellerSummary;
export type FormatSummaryResponse = FormatSpecificSummary;

export type ToolInput = {
  domain: string;
};
