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
    faircher_domain_ads_summary: {
      definition: {
        name: "faircher_domain_ads_summary",
        description:
          "Returns consolidated advertising intelligence for a domain, including search, display, video, CTV, and advertising infrastructure signals.",
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

      async run(args: { domain: string }) {
        try {
          if (
            !args ||
            typeof args.domain !== "string" ||
            args.domain.trim().length === 0
          ) {
            return wrapContent(
              buildToolError(
                "invalid_domain",
                "Domain must be a valid apex domain.",
                { domain: args?.domain }
              )
            );
          }

          const lookbackDays = DEFAULT_LOOKBACK_DAYS;
          const includeBuiltWith = Boolean(process.env.BUILTWITH_KEY);

          const domain = normalizeDomain(args.domain);
          const timePeriod = computeTimePeriod(lookbackDays);

          /* --------------------------------------------------------------
             Fetch advertising data
             -------------------------------------------------------------- */

          const [
            displayAds,
            searchAds,
            youtubeAds,
            videoAdsRaw,
          ] = await Promise.all([
            fetchDisplayAds(domain, timePeriod),
            fetchSearchAds(domain, timePeriod),
            fetchYouTubeAds(domain, timePeriod),
            fetchNonYouTubeVideoAds(domain, timePeriod),
          ]);

          /* --------------------------------------------------------------
             BuiltWith enrichment (EXACTLY ONCE)
             -------------------------------------------------------------- */

          let infrastructure: unknown | null = null;

          if (includeBuiltWith) {
            try {
              infrastructure = await fetchBuiltWith(domain);
            } catch (error) {
              console.warn(
                "BuiltWith enrichment failed; continuing without it",
                {
                  domain,
                  cause:
                    error instanceof Error ? error.message : "Unknown error",
                }
              );
              infrastructure = null;
            }
          }

          /* --------------------------------------------------------------
             Normalize & analyze
             -------------------------------------------------------------- */

          const ads = [
            ...displayAds.flatMap(upstream => normalizeAds({ upstream })),
            ...searchAds.flatMap(upstream => normalizeAds({ upstream })),
            ...youtubeAds.flatMap(upstream => normalizeAds({ upstream })),
            ...videoAdsRaw.flatMap(upstream => normalizeAds({ upstream })),
          ];

          const analysis = analyzeAds({
            domain,
            ads,
            infrastructure,
          });

          const sellerSummary = buildSellerSummary(analysis);

          return wrapContent(sellerSummary);
        } catch (error) {
          if (error instanceof ValidationError) {
            return wrapContent(
              buildToolError(
                "invalid_domain",
                "Domain must be a valid apex domain.",
                { domain: args?.domain }
              )
            );
          }

          return wrapContent(
            buildToolError(
              "upstream_error",
              "Upstream ads service unavailable.",
              {
                cause:
                  error instanceof Error ? error.message : "Unknown error",
                retryable: true,
              }
            )
          );
        }
      },
    },
  };
}

/* ============================================================================
   Helpers
   ============================================================================ */

function wrapContent(payload: unknown) {
  return {
    content: [
      {
        type: "json",
        json: payload,
      },
    ],
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
