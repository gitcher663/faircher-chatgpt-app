import { differenceInDays, parseISO } from "date-fns";
import type { AdsAnalysis, CanonicalAdFormat } from "./ads_analysis";
import { ANALYSIS_WINDOW } from "./ads_analysis";

export type FormatSpecificSummary = {
  format: CanonicalAdFormat;
  analysis_window_days: number;
  region: string;
  total_ads_detected: number;
  share_of_total_activity: number;
  activity_pattern: "Always-on" | "Seasonal" | "Burst-driven";
  sales_signal_strength: "Weak" | "Moderate" | "Strong";
};

export type SellerSummary = {
  domain: string;
  advertising_activity_snapshot: {
    status: "Active" | "Inactive" | "Inactive (Historical Buyer)";
    confidence_level: "Low" | "Medium" | "High";
    analysis_window_days: number;
    region: string;
    sales_signal_strength: "Weak" | "Moderate" | "Strong";
    total_ads_detected: number;
  };
  advertising_behavior_profile: {
    advertising_intensity: "Low" | "Moderate" | "High";
    strategy_orientation: "Performance-driven" | "Brand-led" | "Mixed";
    campaign_continuity: "Short-term" | "Long-running";
    format_sophistication: "Low" | "Moderate" | "High";
    experimentation_level: "Limited" | "Moderate" | "Aggressive";
  };
  activity_timeline: {
    first_observed: string | null;
    most_recent_activity: string | null;
    ad_longevity_days: number | null;
    always_on_presence: "Yes" | "No";
  };
  ad_format_mix: Array<{
    format: CanonicalAdFormat;
    count: number;
    share: number;
  }>;
  campaign_stability_signals: {
    average_ad_lifespan_days: number | null;
    creative_rotation: "Low" | "Moderate" | "High";
    burst_activity_detected: "Yes" | "No";
    volatility_index: "Low" | "Medium" | "High";
  };
  advertiser_scale: {
    scale_classification: "Local" | "Regional" | "National";
    geographic_focus: "Single-market" | "Multi-market" | "Nationwide";
    buying_complexity: "Simple" | "Moderate" | "Advanced";
  };
  estimated_monthly_media_spend: {
    spend_tier:
      | "$500 – $10,000 / month"
      | "$10,001 – $20,000 / month"
      | "$20,001 – $100,000 / month"
      | "$100,000+ / month";
  };
  spend_adequacy: {
    relative_investment_level:
      | "Underinvested"
      | "Appropriately Invested"
      | "Overextended";
    consistency_vs_scale: "Low" | "Moderate" | "High";
    growth_headroom: "Limited" | "Moderate" | "Significant";
  };
  spend_posture: {
    commitment_level: "Experimental" | "Sustained" | "Aggressive";
    scaling_pattern: "Flat" | "Seasonal" | "Accelerating";
    risk_profile: "Conservative" | "Balanced" | "Aggressive";
  };
  sales_interpretation: {
    sell_with_opportunity: string;
    sell_against_opportunity: string;
    outreach_recommendation: string;
  };
  data_scope: {
    geography: string;
    lookback_window_days: number;
    source: string;
  };
};

function percent(count: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Number(((count / total) * 100).toFixed(1));
}

function confidenceLevel(totalAds: number): "Low" | "Medium" | "High" {
  if (totalAds < 5) {
    return "Low";
  }

  if (totalAds < 15) {
    return "Medium";
  }

  return "High";
}

function salesSignalStrength(
  totalAds: number
): "Weak" | "Moderate" | "Strong" {
  if (totalAds < 5) {
    return "Weak";
  }

  if (totalAds < 20) {
    return "Moderate";
  }

  return "Strong";
}

function advertisingIntensity(totalAds: number): "Low" | "Moderate" | "High" {
  if (totalAds < 5) {
    return "Low";
  }

  if (totalAds < 20) {
    return "Moderate";
  }

  return "High";
}

function strategyOrientation(
  formats: Record<CanonicalAdFormat, number>,
  totalAds: number
): "Performance-driven" | "Brand-led" | "Mixed" {
  if (totalAds === 0) {
    return "Mixed";
  }

  const searchShare = percent(formats["Search Ads"], totalAds);
  const brandShare = percent(
    formats["Display Ads"] + formats["Video Ads"],
    totalAds
  );

  if (searchShare >= 60) {
    return "Performance-driven";
  }

  if (brandShare >= 60) {
    return "Brand-led";
  }

  return "Mixed";
}

function campaignContinuity(adLongevityDays: number | null): "Short-term" | "Long-running" {
  if (!adLongevityDays || adLongevityDays < 180) {
    return "Short-term";
  }

  return "Long-running";
}

function formatSophistication(
  formats: Record<CanonicalAdFormat, number>,
  totalAds: number
): "Low" | "Moderate" | "High" {
  if (totalAds < 5) {
    return "Low";
  }

  const activeFormats = Object.values(formats).filter(count => count > 0).length;

  if (activeFormats >= 3) {
    return "High";
  }

  if (activeFormats === 2) {
    return "Moderate";
  }

  return "Low";
}

function experimentationLevel(totalAds: number): "Limited" | "Moderate" | "Aggressive" {
  if (totalAds < 10) {
    return "Limited";
  }

  if (totalAds < 30) {
    return "Moderate";
  }

  return "Aggressive";
}

function activityPattern(
  adLongevityDays: number | null,
  lastSeenDaysAgo: number | null,
  totalAds: number
): "Always-on" | "Seasonal" | "Burst-driven" {
  if (totalAds === 0) {
    return "Burst-driven";
  }

  if (adLongevityDays !== null && adLongevityDays >= 200 && lastSeenDaysAgo !== null && lastSeenDaysAgo <= 30) {
    return "Always-on";
  }

  if (adLongevityDays !== null && adLongevityDays >= 90) {
    return "Seasonal";
  }

  return "Burst-driven";
}

function averageLifespanDays(ads: AdsAnalysis["ads"]): number | null {
  const lifespans = ads
    .map(ad => {
      const first = parseISO(ad.first_seen);
      const last = parseISO(ad.last_seen);
      if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
        return null;
      }
      return differenceInDays(last, first);
    })
    .filter((value): value is number => value !== null);

  if (lifespans.length === 0) {
    return null;
  }

  return Math.round(lifespans.reduce((sum, value) => sum + value, 0) / lifespans.length);
}

function creativeRotation(totalAds: number): "Low" | "Moderate" | "High" {
  if (totalAds >= 30) {
    return "High";
  }

  if (totalAds >= 10) {
    return "Moderate";
  }

  return "Low";
}

function burstDetected(adLongevityDays: number | null, totalAds: number): "Yes" | "No" {
  if (adLongevityDays !== null && adLongevityDays < 60 && totalAds >= 5) {
    return "Yes";
  }

  return "No";
}

function volatilityIndex(
  status: SellerSummary["advertising_activity_snapshot"]["status"],
  burst: "Yes" | "No"
): "Low" | "Medium" | "High" {
  if (burst === "Yes") {
    return "High";
  }

  if (status !== "Active") {
    return "Medium";
  }

  return "Low";
}

function advertiserScale(totalAds: number): SellerSummary["advertiser_scale"]["scale_classification"] {
  if (totalAds >= 40) {
    return "National";
  }

  if (totalAds >= 15) {
    return "Regional";
  }

  return "Local";
}

function geographicFocus(
  scale: SellerSummary["advertiser_scale"]["scale_classification"]
): SellerSummary["advertiser_scale"]["geographic_focus"] {
  if (scale === "National") {
    return "Nationwide";
  }

  if (scale === "Regional") {
    return "Multi-market";
  }

  return "Single-market";
}

function buyingComplexity(
  formatLevel: SellerSummary["advertising_behavior_profile"]["format_sophistication"]
): SellerSummary["advertiser_scale"]["buying_complexity"] {
  if (formatLevel === "High") {
    return "Advanced";
  }

  if (formatLevel === "Moderate") {
    return "Moderate";
  }

  return "Simple";
}

function spendTier(totalAds: number): SellerSummary["estimated_monthly_media_spend"]["spend_tier"] {
  if (totalAds >= 60) {
    return "$100,000+ / month";
  }

  if (totalAds >= 30) {
    return "$20,001 – $100,000 / month";
  }

  if (totalAds >= 10) {
    return "$10,001 – $20,000 / month";
  }

  return "$500 – $10,000 / month";
}

function relativeInvestmentLevel(
  scale: SellerSummary["advertiser_scale"]["scale_classification"],
  totalAds: number
): SellerSummary["spend_adequacy"]["relative_investment_level"] {
  if (scale === "Local" && totalAds >= 60) {
    return "Overextended";
  }

  if (scale === "National" && totalAds < 30) {
    return "Underinvested";
  }

  if (scale === "Regional" && totalAds < 15) {
    return "Underinvested";
  }

  if (totalAds >= 10) {
    return "Appropriately Invested";
  }

  return "Underinvested";
}

function consistencyVsScale(
  status: SellerSummary["advertising_activity_snapshot"]["status"],
  adLongevityDays: number | null,
  totalAds: number
): "Low" | "Moderate" | "High" {
  if (status === "Active" && adLongevityDays !== null && adLongevityDays >= 180) {
    return "High";
  }

  if (totalAds >= 5) {
    return "Moderate";
  }

  return "Low";
}

function growthHeadroom(
  investmentLevel: SellerSummary["spend_adequacy"]["relative_investment_level"]
): SellerSummary["spend_adequacy"]["growth_headroom"] {
  if (investmentLevel === "Underinvested") {
    return "Significant";
  }

  if (investmentLevel === "Overextended") {
    return "Limited";
  }

  return "Moderate";
}

function commitmentLevel(
  totalAds: number,
  status: SellerSummary["advertising_activity_snapshot"]["status"],
  adLongevityDays: number | null
): SellerSummary["spend_posture"]["commitment_level"] {
  if (totalAds >= 40) {
    return "Aggressive";
  }

  if (status === "Active" && adLongevityDays !== null && adLongevityDays >= 120) {
    return "Sustained";
  }

  return "Experimental";
}

function scalingPattern(
  burst: "Yes" | "No",
  adLongevityDays: number | null
): SellerSummary["spend_posture"]["scaling_pattern"] {
  if (burst === "Yes") {
    return "Seasonal";
  }

  if (adLongevityDays !== null && adLongevityDays >= 200) {
    return "Flat";
  }

  return "Accelerating";
}

function riskProfile(
  investmentLevel: SellerSummary["spend_adequacy"]["relative_investment_level"],
  commitment: SellerSummary["spend_posture"]["commitment_level"]
): SellerSummary["spend_posture"]["risk_profile"] {
  if (investmentLevel === "Overextended" || commitment === "Aggressive") {
    return "Aggressive";
  }

  if (investmentLevel === "Underinvested") {
    return "Conservative";
  }

  return "Balanced";
}

function statusFromLastSeen(
  totalAds: number,
  lastSeenDaysAgo: number | null
): SellerSummary["advertising_activity_snapshot"]["status"] {
  if (totalAds === 0) {
    return "Inactive";
  }

  if (lastSeenDaysAgo !== null && lastSeenDaysAgo > 30) {
    return "Inactive (Historical Buyer)";
  }

  return "Active";
}

function toDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function buildSalesInterpretation(
  scale: SellerSummary["advertiser_scale"]["scale_classification"],
  spendTierLabel: SellerSummary["estimated_monthly_media_spend"]["spend_tier"],
  formatLevel: SellerSummary["advertising_behavior_profile"]["format_sophistication"],
  activityPatternLabel: FormatSpecificSummary["activity_pattern"]
): SellerSummary["sales_interpretation"] {
  return {
    sell_with_opportunity: `Position as a ${scale.toLowerCase()} buyer with ${spendTierLabel} signals and ${formatLevel.toLowerCase()} format depth.`,
    sell_against_opportunity: `Highlight competitive coverage gaps when activity shifts ${activityPatternLabel.toLowerCase()} and reinforce share-of-voice protection.`,
    outreach_recommendation: `Package inventory bundles matched to ${scale.toLowerCase()} scale, balancing always-on coverage with flexible bursts.`,
  };
}

export function buildSellerSummary(analysis: AdsAnalysis): SellerSummary {
  const totalAds = analysis.total_ads;
  const status = statusFromLastSeen(totalAds, analysis.last_seen_days_ago);
  const adLongevity = analysis.ad_lifespan_days;
  const pattern = activityPattern(adLongevity, analysis.last_seen_days_ago, totalAds);

  const formatMix = (Object.entries(analysis.formats) as Array<
    [CanonicalAdFormat, number]
  >)
    .filter(([, count]) => count > 0)
    .map(([format, count]) => ({
      format,
      count,
      share: percent(count, totalAds),
    }));

  const formatLevel = formatSophistication(analysis.formats, totalAds);
  const scale = advertiserScale(totalAds);
  const spendTierLabel = spendTier(totalAds);
  const investmentLevel = relativeInvestmentLevel(scale, totalAds);
  const burst = burstDetected(adLongevity, totalAds);

  return {
    domain: analysis.domain,
    advertising_activity_snapshot: {
      status,
      confidence_level: confidenceLevel(totalAds),
      analysis_window_days: ANALYSIS_WINDOW.days,
      region: ANALYSIS_WINDOW.region,
      sales_signal_strength: salesSignalStrength(totalAds),
      total_ads_detected: totalAds,
    },
    advertising_behavior_profile: {
      advertising_intensity: advertisingIntensity(totalAds),
      strategy_orientation: strategyOrientation(analysis.formats, totalAds),
      campaign_continuity: campaignContinuity(adLongevity),
      format_sophistication: formatLevel,
      experimentation_level: experimentationLevel(totalAds),
    },
    activity_timeline: {
      first_observed: toDate(analysis.first_seen),
      most_recent_activity: toDate(analysis.last_seen),
      ad_longevity_days: adLongevity,
      always_on_presence:
        status === "Active" && adLongevity !== null && adLongevity >= 180
          ? "Yes"
          : "No",
    },
    ad_format_mix: formatMix,
    campaign_stability_signals: {
      average_ad_lifespan_days: averageLifespanDays(analysis.ads),
      creative_rotation: creativeRotation(totalAds),
      burst_activity_detected: burst,
      volatility_index: volatilityIndex(status, burst),
    },
    advertiser_scale: {
      scale_classification: scale,
      geographic_focus: geographicFocus(scale),
      buying_complexity: buyingComplexity(formatLevel),
    },
    estimated_monthly_media_spend: {
      spend_tier: spendTierLabel,
    },
    spend_adequacy: {
      relative_investment_level: investmentLevel,
      consistency_vs_scale: consistencyVsScale(status, adLongevity, totalAds),
      growth_headroom: growthHeadroom(investmentLevel),
    },
    spend_posture: {
      commitment_level: commitmentLevel(totalAds, status, adLongevity),
      scaling_pattern: scalingPattern(burst, adLongevity),
      risk_profile: riskProfile(investmentLevel, commitmentLevel(totalAds, status, adLongevity)),
    },
    sales_interpretation: buildSalesInterpretation(
      scale,
      spendTierLabel,
      formatLevel,
      pattern
    ),
    data_scope: {
      geography: "United States",
      lookback_window_days: ANALYSIS_WINDOW.days,
      source: ANALYSIS_WINDOW.source,
    },
  };
}

export function buildDomainSummaryText(summary: SellerSummary): string {
  const snapshot = summary.advertising_activity_snapshot;
  const behavior = summary.advertising_behavior_profile;
  const timeline = summary.activity_timeline;
  const stability = summary.campaign_stability_signals;
  const scale = summary.advertiser_scale;
  const spend = summary.estimated_monthly_media_spend;
  const adequacy = summary.spend_adequacy;
  const posture = summary.spend_posture;
  const sales = summary.sales_interpretation;

  const formatMap = new Map(
    summary.ad_format_mix.map(row => [row.format, row] as const)
  );
  const baseFormats: CanonicalAdFormat[] = [
    "Search Ads",
    "Video Ads",
    "Display Ads",
  ];
  const formatRows = [
    ...baseFormats.map(format => {
      const row = formatMap.get(format);
      return `| ${format} | ${row?.count ?? 0} | ${row?.share ?? 0}% |`;
    }),
    ...(formatMap.has("Other Ads")
      ? [
          `| Other Ads | ${formatMap.get("Other Ads")?.count ?? 0} | ${
            formatMap.get("Other Ads")?.share ?? 0
          }% |`,
        ]
      : []),
  ];

  return [
    `## Advertising Activity Snapshot — ${summary.domain}`,
    "",
    `Status: ${snapshot.status}`,
    `Confidence Level: ${snapshot.confidence_level}`,
    `Analysis Window: Last ${snapshot.analysis_window_days} days (${snapshot.region})`,
    `Sales Signal Strength: ${snapshot.sales_signal_strength}`,
    `Total Ads Detected: ${snapshot.total_ads_detected}`,
    "",
    "## Advertising Behavior Profile",
    "",
    `- Advertising Intensity: ${behavior.advertising_intensity}`,
    `- Strategy Orientation: ${behavior.strategy_orientation}`,
    `- Campaign Continuity: ${behavior.campaign_continuity}`,
    `- Format Sophistication: ${behavior.format_sophistication}`,
    `- Experimentation Level: ${behavior.experimentation_level}`,
    "",
    "## Activity Timeline",
    "",
    `- First Observed: ${timeline.first_observed ?? "Not available"}`,
    `- Most Recent Activity: ${timeline.most_recent_activity ?? "Not available"}`,
    `- Ad Longevity: ~${timeline.ad_longevity_days ?? 0} days`,
    `- Always-On Presence: ${timeline.always_on_presence}`,
    "",
    "## Ad Format Mix (365-Day View)",
    "",
    "| Format | Count | Share |",
    "|-------------|------:|------:|",
    ...formatRows,
    "",
    "## Campaign Stability Signals",
    "",
    `- Average Ad Lifespan: ${stability.average_ad_lifespan_days ?? 0} days`,
    `- Creative Rotation: ${stability.creative_rotation}`,
    `- Burst Activity Detected: ${stability.burst_activity_detected}`,
    `- Volatility Index: ${stability.volatility_index}`,
    "",
    "## Advertiser Scale (Inferred)",
    "",
    `- Scale Classification: ${scale.scale_classification}`,
    `- Geographic Focus: ${scale.geographic_focus}`,
    `- Buying Complexity: ${scale.buying_complexity}`,
    "",
    "## Estimated Monthly Media Spend (Inferred)",
    "",
    `- Spend Tier: ${spend.spend_tier}`,
    "",
    "## Spend Adequacy (Relative to Scale)",
    "",
    `- Relative Investment Level: ${adequacy.relative_investment_level}`,
    `- Consistency vs Scale: ${adequacy.consistency_vs_scale}`,
    `- Growth Headroom: ${adequacy.growth_headroom}`,
    "",
    "## Spend Posture (Inferred)",
    "",
    `- Commitment Level: ${posture.commitment_level}`,
    `- Scaling Pattern: ${posture.scaling_pattern}`,
    `- Risk Profile: ${posture.risk_profile}`,
    "",
    "## Sales Interpretation (Faircher)",
    "",
    `- Sell-With Opportunity: ${sales.sell_with_opportunity}`,
    `- Sell-Against Opportunity: ${sales.sell_against_opportunity}`,
    `- Outreach / Packaging Recommendation: ${sales.outreach_recommendation}`,
    "",
    "## Data Scope & Source",
    "",
    `- Geography: United States`,
    `- Lookback Window: ${summary.data_scope.lookback_window_days} days`,
    `- Source: ${summary.data_scope.source}`,
  ].join("\n");
}

export function buildFormatSummaryData(
  analysis: AdsAnalysis,
  format: CanonicalAdFormat
): FormatSpecificSummary {
  const totalAds = analysis.total_ads;
  const formatAds = analysis.ads.filter(ad => ad.format === format);
  const formatTotal = formatAds.length;
  const firstSeen = formatAds.length
    ? formatAds
        .map(ad => parseISO(ad.first_seen))
        .reduce((min, date) => (date < min ? date : min))
    : null;
  const lastSeen = formatAds.length
    ? formatAds
        .map(ad => parseISO(ad.last_seen))
        .reduce((max, date) => (date > max ? date : max))
    : null;
  const longevity =
    firstSeen && lastSeen ? differenceInDays(lastSeen, firstSeen) : null;
  const lastSeenDaysAgo = lastSeen ? differenceInDays(new Date(), lastSeen) : null;

  return {
    format,
    analysis_window_days: ANALYSIS_WINDOW.days,
    region: ANALYSIS_WINDOW.region,
    total_ads_detected: formatTotal,
    share_of_total_activity: percent(formatTotal, totalAds),
    activity_pattern: activityPattern(longevity, lastSeenDaysAgo, formatTotal),
    sales_signal_strength: salesSignalStrength(formatTotal),
  };
}

export function buildFormatSummaryText(
  domain: string,
  summary: FormatSpecificSummary
): string {
  return [
    `## Format Activity Snapshot — ${domain}`,
    "",
    `- Format: ${summary.format}`,
    `- Analysis Window: Last ${summary.analysis_window_days} days (${summary.region})`,
    `- Total Ads Detected: ${summary.total_ads_detected}`,
    `- Share of Total Activity: ${summary.share_of_total_activity}%`,
    `- Activity Pattern: ${summary.activity_pattern}`,
    `- Sales Signal Strength: ${summary.sales_signal_strength}`,
    "",
    "## Seller Guidance",
    "",
    "- Align inventory packages to the observed format share and cadence.",
    "- Treat burst-heavy patterns as short-term opportunities for sponsorships or seasonal bundles.",
    "- Reinforce always-on formats with continuity guarantees and premium placement options.",
  ].join("\n");
}
