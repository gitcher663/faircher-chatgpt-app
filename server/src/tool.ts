import { normalizeDomain } from "./normalize";
import { fetchUpstreamAds } from "./upstream";
import { transformUpstreamPayload } from "./transform";

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: any;
  annotations?: {
    readOnlyHint?: boolean;
    openWorldHint?: boolean;
    destructiveHint?: boolean;
  };
  _meta?: Record<string, unknown>;
};

export type ToolHandler = (args: any) => Promise<any>;

export type ToolRegistry = Record<
  string,
  { definition: ToolDefinition; run: ToolHandler }
>;

export function registerFairCherTool(): ToolRegistry {
  const definition: ToolDefinition = {
    name: "faircher_domain_ads_summary",
    description:
      "Summarized advertising activity for a domain, including advertisers, formats, and activity.",
    inputSchema: {
      type: "object",
      properties: {
