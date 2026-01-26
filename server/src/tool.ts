import { normalizeDomain } from "./normalize";
import { ValidationError } from "./errors";
import { fetchAllPages } from "./upstream";
import { analyzeAds } from "./ads_analysis";
import { normalizeAds } from "./normalize_ads";
import { buildSellerSummary } from "./summary_builder";

/* ============================================================================
   Tool Types
   ============================================================================ */

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
};

type JSONSchema7 = Record<string, unknown>;

export type ToolRuntime = {
  definition: ToolDefinition;
  run: (args: any) => Promise<any>;
};

export type ToolRegistry = Record<string, ToolRuntime>;

type ToolErrorCode = "invalid_domain" | "upstream_error";

export type ToolError = {
  error: {
    code: ToolErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ToolOutput = ReturnType<typeof buildSellerSummary> | ToolError;

/* ============================================================================
   Constants
   ============================================================================ */

const DEFAULT_LOOKBACK_DAYS = 365;
const SEARCH_API_BASE = "https://www.searchapi.io/api/v1/search";
const BUILTWITH_API_BASE = "https://api.builtwith.com/v21/api.json";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

/* ============================================================================
   Time helpers (SearchAPI only)
   ============================================================================ */

function computeTimePeriod(lookbackDays: number): string {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - lookbackDays);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  return `${fromStr}..${toStr}`;
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  }: { timeoutMs?: number; retries?: number; retryDelayMs?: number } = {}
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      if (!response.ok && shouldRetryStatus(response.status)) {
        lastError = new Error(`Retryable status ${response.status}`);
      } else {
        return response;
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Unknown fetch error");
    } finally {
      clearTimeout(timeoutId);
    }

    if (attempt < retries) {
      await new Promise(resolve =>
        setTimeout(resolve, retryDelayMs * (attempt + 1))
      );
    }
  }

  throw lastError ?? new Error("Upstream request failed");
}

/* ============================================================================
   Upstream fetchers (NO interpretation here)
   ============================================================================ */

async function fetchDisplayAds(domain: string, timePeriod: string) {
  return fetchAllPages(SEARCH_API_BASE, {
    engine: "google_ads_transparency_center",
    domain,
    ad_format: "image",
    num: 100,
    time_period: timePeriod,
  });
}

async function fetchSearchAds(domain: string, timePeriod: string) {
  return fetchAllPages(SEARCH_API_BASE, {
    engine: "google_ads_transparency_center",
    domain,
    ad_format: "text",
    num: 100,
    time_period: timePeriod,
  });
}

async function fetchYouTubeAds(domain: string, timePeriod: string) {
  return fetchAllPages(SEARCH_API_BASE, {
    engine: "google_ads_transparency_center",
    domain,
    platform: "youtube",
    ad_format: "video",
    num: 100,
    time_period: timePeriod,
  });
}

async function fetchNonYouTubeVideoAds(domain: string, timePeriod: string) {
  return fetchAllPages(SEARCH_API_BASE, {
    engine: "google_ads_transparency_center",
    domain,
    ad_format: "video",
    num: 100,
    time_period: timePeriod,
    // NOTE: non-YouTube filtering is inferred downstream
  });
}

async function fetchLinkedInAds(advertiser: string) {
  return fetchAllPages(SEARCH_API_BASE, {
    engine: "linkedin_ad_library",
    advertiser,
    time_period: "last_year",
  });
}

async function fetchBuiltWith(domain: string) {
  const apiKey = process.env.BUILTWITH_KEY;
  if (!apiKey) {
    throw new Error("Missing BUILTWITH_KEY");
  }
  const url =
    `${BUILTWITH_API_BASE}` +
    `?KEY=${apiKey}` +
    `&LOOKUP=${domain}` +
    `&NOPII=yes` +
    `&NOMETA=yes` +
    `&NOATTR=yes`;

  const res = await fetchWithRetry(url, {});
  if (!res.ok) {
    throw new Error(`BuiltWith error: ${res.status}`);
  }
  return res.json();
}

/* ============================================================================
   Tool Registration
   ============================================================================ */

export function registerFairCherTool(): ToolRegistry {
  return {
    // MCP discovery lifecycle: the host calls tools/list, then uses the tool
    // name returned there when issuing tools/call. If the tool name in this
    // registry does not match what ChatGPT expects, the model reports "no tools
    // available" because MCP discovery never surfaces a compatible tool.
    faircher_domain_ads_summary: {
      definition: {
        // Tool name must match docs/tool-spec.md exactly so tools/list exposes
        // the contract ChatGPT is instructed to call.
        name: "faircher_domain_ads_summary",
        description:
          "Returns consolidated advertising intelligence for a domain, including search, display, video, CTV, paid social, and advertising infrastructure signals.",
        inputSchema: {
          type: "object",
          required: ["domain"],
          properties: {
            domain: {
              type: "string",
              description: "Apex domain (e.g. example.com)",
            },
          },
        },
      },

      /* ======================================================================
         Runtime
         ====================================================================== */

      async run(args: { domain: string }): Promise<ToolOutput> {
        try {
          if (
            !args ||
            typeof args.domain !== "string" ||
            args.domain.trim().length === 0
          ) {
            return buildToolError(
              "invalid_domain",
              "Domain must be a valid apex domain.",
              { domain: args?.domain }
            );
          }

          const lookbackDays = DEFAULT_LOOKBACK_DAYS;
          const includeBuiltWith = true;

          // Normalize only what SHOULD be normalized
          const domain = normalizeDomain(args.domain);

          // LinkedIn advertiser handling (explicit)
          const advertiser = domain;

          const timePeriod = computeTimePeriod(lookbackDays);

          /* --------------------------------------------------------------
             Fetch creative-level advertising data
             -------------------------------------------------------------- */

          const [
            displayAds,
            searchAds,
            youtubeAds,
            videoAdsRaw,
            linkedInAds,
          ] = await Promise.all([
            fetchDisplayAds(domain, timePeriod),
            fetchSearchAds(domain, timePeriod),
            fetchYouTubeAds(domain, timePeriod),
            fetchNonYouTubeVideoAds(domain, timePeriod),
            fetchLinkedInAds(advertiser),
          ]);

          /* --------------------------------------------------------------
             Advertising infrastructure intelligence (BuiltWith)
             -------------------------------------------------------------- */

          const builtWith = includeBuiltWith
            ? await fetchBuiltWith(domain)
            : null;

          void builtWith;

          /* --------------------------------------------------------------
             Analysis (facts only)
             -------------------------------------------------------------- */

          const ads = [
            ...displayAds.flatMap(upstream =>
              normalizeAds({ upstream })
            ),
            ...searchAds.flatMap(upstream =>
              normalizeAds({ upstream })
            ),
            ...youtubeAds.flatMap(upstream =>
              normalizeAds({ upstream })
            ),
            ...videoAdsRaw.flatMap(upstream =>
              normalizeAds({ upstream })
            ),
            ...linkedInAds.flatMap(upstream =>
              normalizeAds({ upstream })
            ),
          ];

          const analysis = analyzeAds({
            domain,
            ads,
          });

          /* --------------------------------------------------------------
             Tool output (structured data only)
             -------------------------------------------------------------- */

          // Output contract (success):
          // - Returns AdsSummary JSON with required keys:
          //   - domain: string
          //   - advertising_activity_snapshot
          //   - advertising_behavior_profile
          //   - activity_timeline
          //   - ad_format_mix
          //   - campaign_stability_signals
          //   - advertiser_scale
          //   - estimated_monthly_media_spend
          //   - spend_adequacy
          //   - spend_posture
          //   - sales_interpretation
          //   - data_scope
          //
          // Output contract (error):
          // - { error: { code, message, details? } }
          const sellerSummary = buildSellerSummary(analysis);

          // The UI consumes window.openai.toolOutput as AdsSummaryOutput, so the
          // MCP tools/call response must return the structured summary directly
          // rather than wrapping it in { structured, summary, meta }.
          return sellerSummary;
        } catch (error) {
          if (error instanceof ValidationError) {
            return buildToolError(
              "invalid_domain",
              "Domain must be a valid apex domain.",
              { domain: args?.domain }
            );
          }
          return buildToolError(
            "upstream_error",
            "Upstream ads service unavailable.",
            {
              cause:
                error instanceof Error ? error.message : "Unknown error",
              retryable: true,
            }
          );
        }
      },
    },
  };
}

function buildToolError(
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>
): ToolError {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
