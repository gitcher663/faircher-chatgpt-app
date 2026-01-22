import type { AdsSummaryOutput } from "../types";
import DistributionBar from "./DistributionBar";

type Props = {
  data: AdsSummaryOutput;
};

export default function AdsSummaryCard({ data }: Props) {
  const {
    domain,
    advertising_activity_snapshot: snapshot,
    advertising_behavior_profile: behavior,
    activity_timeline: timeline,
    ad_format_mix: formatMix,
    campaign_stability_signals: stability,
    advertiser_scale: scale,
    estimated_monthly_media_spend: spend,
    spend_adequacy: adequacy,
    spend_posture: posture,
  } = data;

  return (
    <div style={{ padding: "12px" }}>
      <h3>{domain}</h3>

      <p>
        <strong>Status:</strong> {snapshot.status}
      </p>

      <p>
        <strong>Total ads detected:</strong> {snapshot.total_ads_detected}
      </p>

      <p>
        <strong>Sales signal strength:</strong> {snapshot.sales_signal_strength}
      </p>

      <p>
        <strong>Advertising intensity:</strong> {behavior.advertising_intensity}
      </p>

      <p>
        <strong>Format sophistication:</strong> {behavior.format_sophistication}
      </p>

      <p>
        <strong>Always-on presence:</strong> {timeline.always_on_presence}
      </p>

      <DistributionBar formats={formatMix} />

      <div style={{ marginTop: "12px" }}>
        <h4>Campaign stability</h4>
        <p>
          <strong>Creative rotation:</strong> {stability.creative_rotation}
        </p>
        <p>
          <strong>Burst activity:</strong> {stability.burst_activity_detected}
        </p>
        <p>
          <strong>Volatility index:</strong> {stability.volatility_index}
        </p>
      </div>

      <div style={{ marginTop: "12px" }}>
        <h4>Scale & spend</h4>
        <p>
          <strong>Scale classification:</strong> {scale.scale_classification}
        </p>
        <p>
          <strong>Spend tier:</strong> {spend.spend_tier}
        </p>
        <p>
          <strong>Relative investment:</strong>{" "}
          {adequacy.relative_investment_level}
        </p>
        <p>
          <strong>Spend posture:</strong> {posture.commitment_level}
        </p>
      </div>
    </div>
  );
}
