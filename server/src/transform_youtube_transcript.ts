/**
 * transform_youtube_transcript.ts
 *
 * PURPOSE
 * -------
 * Transforms raw YouTube transcript API responses into
 * seller-facing, high-impact creative intelligence.
 *
 * This file:
 * - Does NOT fetch data
 * - Does NOT expose platform metadata
 * - Does NOT leak IDs or raw JSON
 *
 * It produces human-ready insights for ChatGPT to render.
 */

type TranscriptLine = {
  text: string;
  start: number;
  duration: number;
};

type YouTubeTranscriptPayload = {
  transcripts?: TranscriptLine[];
};

export type VideoCreativeInsights = {
  summary: string;
  hook: string;
  key_messages: string[];
  primary_cta: string;
  cta_domain: string | null;
  tone:
    | "Persuasive"
    | "Educational"
    | "Urgency-driven"
    | "Trust-building"
    | "Mixed";
  ad_purpose:
    | "Direct response"
    | "Demand generation"
    | "Brand awareness"
    | "Mixed";
  duration_seconds: number;
  sales_notes: string;
};

/* ============================================================================
   Helpers
   ============================================================================ */

function joinTranscript(lines: TranscriptLine[]): string {
  return lines.map(l => l.text.trim()).join(" ");
}

function extractDomain(text: string): string | null {
  const match = text.match(
    /\b([a-z0-9-]+\.)+[a-z]{2,}\b/i
  );
  return match ? match[0].toLowerCase() : null;
}

function inferCTA(text: string): string {
  const t = text.toLowerCase();

  if (t.includes("buy") || t.includes("shop")) return "Buy now";
  if (t.includes("learn more") || t.includes("learn")) return "Learn more";
  if (t.includes("visit")) return "Visit website";
  if (t.includes("get started")) return "Get started";
  if (t.includes("contact")) return "Contact sales";

  return "Learn more";
}

function inferTone(text: string): VideoCreativeInsights["tone"] {
  const t = text.toLowerCase();

  if (t.includes("protect") || t.includes("trusted")) return "Trust-building";
  if (t.includes("now") || t.includes("today")) return "Urgency-driven";
  if (t.includes("how") || t.includes("explains")) return "Educational";
  if (t.includes("best") || t.includes("designed")) return "Persuasive";

  return "Mixed";
}

function inferPurpose(text: string): VideoCreativeInsights["ad_purpose"] {
  const t = text.toLowerCase();

  if (t.includes("buy") || t.includes("visit")) return "Direct response";
  if (t.includes("designed") || t.includes("developed"))
    return "Demand generation";

  return "Brand awareness";
}

/* ============================================================================
   Public Transformer
   ============================================================================ */

export function transformYouTubeTranscript(
  payload: YouTubeTranscriptPayload
): VideoCreativeInsights | null {
  if (!payload.transcripts || payload.transcripts.length === 0) {
    return null;
  }

  const fullText = joinTranscript(payload.transcripts);
  const durationSeconds = Math.ceil(
    payload.transcripts.reduce(
      (max, t) => Math.max(max, t.start + t.duration),
      0
    )
  );

  const domain = extractDomain(fullText);
  const cta = inferCTA(fullText);
  const tone = inferTone(fullText);
  const purpose = inferPurpose(fullText);

  const hook =
    payload.transcripts[0]?.text ??
    "Attention-grabbing opening message";

  const keyMessages = payload.transcripts
    .slice(1, 6)
    .map(t => t.text)
    .filter(Boolean);

  return {
    summary: `This video ad promotes a solution focused on ${keyMessages
      .slice(0, 2)
      .join(
        " and "
      )}. The messaging emphasizes benefits and directs viewers to take action.`,
    hook,
    key_messages: keyMessages,
    primary_cta: cta,
    cta_domain: domain,
    tone,
    ad_purpose: purpose,
    duration_seconds: durationSeconds,
    sales_notes: domain
      ? `This advertiser is driving traffic to ${domain}. Ideal for sellers offering complementary services, competitive alternatives, or traffic monetization.`
      : `This ad focuses on brand positioning. Best approached with awareness or demand-gen offerings.`,
  };
}
