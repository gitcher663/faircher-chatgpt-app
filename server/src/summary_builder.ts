import type { AdsByFormatEnrichedResponse } from "./transform_ads_by_format";

type DomainSummaryData = {
  domain: string;
  summary: {
    is_running_ads: boolean;
    total_ads_found: number;
    active_advertisers: number;
    primary_advertiser: string | null;
    confidence: number;
  };
  activity: {
    first_seen: string;
    last_seen: string;
    is_recent: boolean;
    ad_lifespan_days: number;
  } | null;
  distribution: {
    formats: Record<"text" | "image" | "video", number>;
  } | null;
  advertisers: Array<{
    name: string;
    ad_count_estimate: number;
    is_primary: boolean;
  }>;
};

type Intensity = {
  label: "High" | "Medium" | "Low";
  bar: string;
};

const BAR_SIZE = 10;

function toBar(value: number, max: number): Intensity {
  if (max <= 0) {
    return { label: "Low", bar: "█".repeat(1).padEnd(BAR_SIZE, "░") };
  }

  const ratio = Math.max(0, Math.min(1, value / max));
  const filled = Math.max(1, Math.round(ratio * BAR_SIZE));
  const bar = "█".repeat(filled).padEnd(BAR_SIZE, "░");

  if (ratio >= 0.67) {
    return { label: "High", bar };
  }

  if (ratio >= 0.34) {
    return { label: "Medium", bar };
  }

  return { label: "Low", bar };
}

function overallSignal(count: number): "High" | "Medium" | "Low" {
  if (count >= 20) {
    return "High";
  }

  if (count >= 5) {
    return "Medium";
  }

  return "Low";
}

function varianceRisk(signal: "High" | "Medium" | "Low"): "Low" | "Moderate" | "High" {
  if (signal === "High") {
    return "Low";
  }

  if (signal === "Medium") {
    return "Moderate";
  }

  return "High";
}

function formatLabel(format: "text" | "image" | "video"): "Search" | "Display" | "Streaming" {
  if (format === "text") {
    return "Search";
  }

  if (format === "image") {
    return "Display";
  }

  return "Streaming";
}

function formatsDetected(formats: Record<"text" | "image" | "video", number> | null): string {
  if (!formats) {
    return "None";
  }

  const detected = (Object.entries(formats) as Array<["text" | "image" | "video", number]>)
    .filter(([, count]) => count > 0)
    .map(([format]) => formatLabel(format));

  return detected.length > 0 ? detected.join(" • ") : "None";
}

function formatMixLines(
  formats: Record<"text" | "image" | "video", number> | null
): string[] {
  const counts = formats ?? { text: 0, image: 0, video: 0 };
  const maxCount = Math.max(counts.text, counts.image, counts.video, 0);

  return ([
    { label: "Streaming", count: counts.video },
    { label: "Search", count: counts.text },
    { label: "Display", count: counts.image },
  ] as const).map(item => {
    const intensity = toBar(item.count, maxCount);
    return `- ${item.label}: ${intensity.bar} ${intensity.label}`;
  });
}

function channelIntensityLines(
  formats: Record<"text" | "image" | "video", number> | null
): string[] {
  const counts = formats ?? { text: 0, image: 0, video: 0 };
  const maxCount = Math.max(counts.text, counts.image, counts.video, 0);
  const entries = [
    { label: "Streaming", count: counts.video },
    { label: "Search", count: counts.text },
    { label: "Display", count: counts.image },
  ];

  return entries.map(entry => {
    const intensity = toBar(entry.count, maxCount);
    return `- ${entry.label}: ${intensity.label}`;
  });
}

function spendRange(count: number): { range: string; confidence: "Low" | "Medium" | "Medium–High" } {
  if (count >= 30) {
    return { range: "$75k – $200k", confidence: "Medium–High" };
  }

  if (count >= 10) {
    return { range: "$25k – $75k", confidence: "Medium" };
  }

  return { range: "$5k – $25k", confidence: "Low" };
}

function formatExecutionLabel(format: "text" | "image" | "video"): string {
  if (format === "text") {
    return "Search: Keyword Breadth";
  }

  if (format === "image") {
    return "Display: Variant Diversity";
  }

  return "Streaming: Creative Rotation";
}

function toDateString(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function summarizeCreativeSignals(data: AdsByFormatEnrichedResponse): string[] {
  const total = data.total_creatives;
  const variationsCount = data.creatives.map(creative => creative.variations?.length ?? 0);
  const avgVariations = variationsCount.length
    ? variationsCount.reduce((sum, count) => sum + count, 0) / variationsCount.length
    : 0;
  const variationIntensity = avgVariations >= 3 ? "High" : avgVariations >= 1.5 ? "Medium" : "Low";
  const hasCTA = data.creatives.some(creative =>
    (creative.variations ?? []).some(variation => Boolean(variation.call_to_action))
  );
  const hasText = data.creatives.some(creative =>
    (creative.variations ?? []).some(variation => Boolean(variation.title || variation.snippet))
  );
  const hasImages = data.creatives.some(creative =>
    (creative.variations ?? []).some(variation => Boolean(variation.image || variation.images?.length))
  );
  const hasVideo = data.creatives.some(creative =>
    (creative.variations ?? []).some(variation => Boolean(variation.video_id || variation.video_link))
  );

  return [
    `- Distinct creatives observed: ${total}`,
    `- Variation density: ${variationIntensity}`,
    `- Call-to-action usage: ${hasCTA ? "Detected" : "Not detected"}`,
    `- Text signal: ${hasText ? "Detected" : "Not detected"}`,
    `- Image signal: ${hasImages ? "Detected" : "Not detected"}`,
    `- Video signal: ${hasVideo ? "Detected" : "Not detected"}`,
  ];
}

function summarizeExecutionObservations(data: AdsByFormatEnrichedResponse): string[] {
  const firstSeen = data.creatives
    .map(creative => toDateString(creative.first_shown_datetime))
    .filter(Boolean) as string[];
  const lastSeen = data.creatives
    .map(creative => toDateString(creative.last_shown_datetime))
    .filter(Boolean) as string[];
  const earliest = firstSeen.length ? firstSeen.sort()[0] : "Unknown";
  const latest = lastSeen.length ? lastSeen.sort().slice(-1)[0] : "Unknown";
  const durationValues = data.creatives
    .map(creative => creative.duration)
    .filter((value): value is number => typeof value === "number");
  const avgDuration = durationValues.length
    ? Math.round(durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length)
    : null;

  return [
    `- First observed: ${earliest}`,
    `- Most recent activity: ${latest}`,
    `- Average creative duration: ${avgDuration !== null ? `${avgDuration}s` : "Not available"}`,
  ];
}

export function buildDomainSummary(data: DomainSummaryData): string {
  const formats = data.distribution?.formats ?? null;
  const signal = overallSignal(data.summary.total_ads_found);
  const formatLines = formatMixLines(formats).join("\n");
  const channelLines = channelIntensityLines(formats).join("\n");
  const detectedFormats = formatsDetected(formats);
  const shouldIncludeSpend = signal !== "Low" && data.summary.total_ads_found > 0;
  const spend = spendRange(data.summary.total_ads_found);

  const highLevelSignals = [
    `- Active advertisers: ${data.summary.active_advertisers}`,
    `- Primary advertiser: ${data.summary.primary_advertiser ?? "Unknown"}`,
    `- Recent activity: ${data.activity?.is_recent ? "Yes" : "No"}`,
    `- Total ads detected: ${data.summary.total_ads_found}`,
  ].join("\n");

  const advertiserConcentration = data.advertisers.slice(0, 3).map(advertiser => advertiser.name);

  const recommendedActions = [
    "- Validate format allocation against stated campaign objectives",
    "- Confirm whether primary advertisers align to brand ownership",
    "- Monitor recent activity cadence for budget pacing shifts",
  ].join("\n");

  const spendSection = shouldIncludeSpend
    ? [
        "## Estimated Media Investment (Modeled)",
        "",
        `**Estimated Monthly Spend:** ${spend.range}`,
        `**Confidence:** ${spend.confidence}`,
        "**Scope:** National",
        "",
      ].join("\n")
    : "";

  const confidenceSection = [
    "## Confidence Assessment",
    "",
    `- Signal Strength: ${signal}`,
    `- Data Persistence: ${data.activity?.is_recent ? "Sustained" : "Intermittent"}`,
    `- Variance Risk: ${varianceRisk(signal)}`,
    "",
  ].join("\n");

  return [
    "## FairCher Domain Overview",
    "",
    `**Brand:** ${data.domain}`,
    `**Domain:** ${data.domain}`,
    "**Campaign Scope:** Unknown",
    `**Formats Detected:** ${detectedFormats}`,
    `**Overall Signal:** ${signal} Activity`,
    "",
    "## Format Mix Overview",
    "",
    formatLines,
    "",
    "## Channel Intensity",
    "",
    channelLines,
    "",
    "## High-Level Signals",
    "",
    highLevelSignals,
    "",
    spendSection,
    confidenceSection,
    "## Recommended Actions",
    "",
    recommendedActions,
    "",
    advertiserConcentration.length > 0
      ? `- Primary advertiser concentration: ${advertiserConcentration.join(", ")}`
      : "- Primary advertiser concentration: Not available",
    "",
    "## Methodology Note",
    "",
    "*Methodology Note: All spend figures are modeled estimates based on observed advertising activity and industry benchmarks. They represent directional investment ranges, not actual reported spend.*",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildFormatSummary(data: AdsByFormatEnrichedResponse): string {
  const signal = overallSignal(data.total_creatives);
  const intensity = toBar(data.total_creatives, Math.max(data.total_creatives, 1));
  const detectedFormat = formatLabel(data.ad_format);
  const shouldIncludeSpend = signal !== "Low" && data.total_creatives > 0;
  const spend = spendRange(data.total_creatives);

  const creativeSignals = summarizeCreativeSignals(data).join("\n");
  const executionObservations = summarizeExecutionObservations(data).join("\n");
  const executionLabel = formatExecutionLabel(data.ad_format);
  const recommendedActions = [
    "- Audit format execution depth against competitive benchmarks",
    "- Identify opportunities to increase variant diversity",
    "- Align creative cadence with observed activity windows",
  ].join("\n");

  const spendSection = shouldIncludeSpend
    ? [
        "## Estimated Media Investment (Modeled)",
        "",
        `**Estimated Monthly Spend:** ${spend.range}`,
        `**Confidence:** ${spend.confidence}`,
        "**Scope:** National",
        "",
      ].join("\n")
    : "";

  const confidenceSection = [
    "## Confidence Assessment",
    "",
    `- Signal Strength: ${signal}`,
    "- Data Persistence: Intermittent",
    `- Variance Risk: ${varianceRisk(signal)}`,
    "",
  ].join("\n");

  return [
    "## FairCher Domain Overview",
    "",
    `**Brand:** ${data.domain}`,
    `**Domain:** ${data.domain}`,
    "**Campaign Scope:** Unknown",
    `**Formats Detected:** ${detectedFormat}`,
    `**Overall Signal:** ${signal} Activity`,
    "",
    "## Format Execution Intensity",
    "",
    `- ${executionLabel} ${intensity.bar} ${intensity.label}`,
    "",
    "## Creative / Copy Signals",
    "",
    creativeSignals,
    "",
    "## Execution Observations",
    "",
    executionObservations,
    "",
    spendSection,
    confidenceSection,
    "## Recommended Actions",
    "",
    recommendedActions,
    "",
    "## Methodology Note",
    "",
    "*Methodology Note: All spend figures are modeled estimates based on observed advertising activity and industry benchmarks. They represent directional investment ranges, not actual reported spend.*",
  ]
    .filter(Boolean)
    .join("\n");
}
