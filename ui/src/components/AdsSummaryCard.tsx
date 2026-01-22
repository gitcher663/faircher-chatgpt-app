import { useEffect } from "react";
import type { AdsSummaryOutput } from "../types";
import DistributionBar from "./DistributionBar";

type Props = {
  data: AdsSummaryOutput;
  showDetails: boolean;
  onToggleDetails: () => void;
};

export default function AdsSummaryCard({
  data,
  showDetails,
  onToggleDetails,
}: Props) {
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
    sales_interpretation: sales,
    data_scope: scope,
  } = data;

  useEffect(() => {
    window.openai?.notifyIntrinsicHeight?.();
  }, [showDetails]);

  return (
    <section className="summary-card">
      <header className="summary-header">
        <div>
          <p className="summary-kicker">Faircher Overview</p>
          <h3>{domain}</h3>
        </div>
        <button
          className="summary-toggle"
          type="button"
          onClick={onToggleDetails}
          aria-expanded={showDetails}
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
      </header>

      <div className="summary-grid">
        <div>
          <p className="summary-label">Status</p>
          <p className="summary-value">{snapshot.status}</p>
        </div>
        <div>
          <p className="summary-label">Total ads detected</p>
          <p className="summary-value">{snapshot.total_ads_detected}</p>
        </div>
        <div>
          <p className="summary-label">Sales signal strength</p>
          <p className="summary-value">{snapshot.sales_signal_strength}</p>
        </div>
        <div>
          <p className="summary-label">Advertising intensity</p>
          <p className="summary-value">{behavior.advertising_intensity}</p>
        </div>
      </div>

      {showDetails && (
        <>
          <div className="summary-block">
            <h4>Behavior & continuity</h4>
            <p>
              <strong>Format sophistication:</strong>{" "}
              {behavior.format_sophistication}
            </p>
            <p>
              <strong>Always-on presence:</strong>{" "}
              {timeline.always_on_presence}
            </p>
          </div>

          <DistributionBar formats={formatMix} />

          <div className="summary-block">
            <h4>Campaign stability</h4>
            <p>
              <strong>Creative rotation:</strong>{" "}
              {stability.creative_rotation}
            </p>
            <p>
              <strong>Burst activity:</strong>{" "}
              {stability.burst_activity_detected}
            </p>
            <p>
              <strong>Volatility index:</strong> {stability.volatility_index}
            </p>
          </div>

          <div className="summary-block">
            <h4>Scale & spend</h4>
            <p>
              <strong>Scale classification:</strong>{" "}
              {scale.scale_classification}
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

          <div className="summary-block">
            <h4>Sales interpretation</h4>
            <p>
              <strong>Sell-with opportunity:</strong>{" "}
              {sales.sell_with_opportunity}
            </p>
            <p>
              <strong>Sell-against opportunity:</strong>{" "}
              {sales.sell_against_opportunity}
            </p>
            <p>
              <strong>Outreach recommendation:</strong>{" "}
              {sales.outreach_recommendation}
            </p>
          </div>

          <div className="summary-block">
            <h4>Data scope</h4>
            <p>
              <strong>Geography:</strong> {scope.geography}
            </p>
            <p>
              <strong>Lookback window:</strong> {scope.lookback_window_days} days
            </p>
            <p>
              <strong>Source:</strong> {scope.source}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
