import type { AdsSummaryOutput } from "../types";

type Props = {
  formats: AdsSummaryOutput["ad_format_mix"];
};

export default function DistributionBar({ formats }: Props) {
  const max = Math.max(0, ...formats.map(item => item.count));

  return (
    <div className="summary-block">
      <h4>Ad formats</h4>

      {formats.length === 0 && (
        <p className="summary-muted">No format activity detected.</p>
      )}

      {formats.map(format => {
        const count = format.count;
        const width = max > 0 ? (count / max) * 100 : 0;

        return (
          <div key={format.format} className="format-row">
            <div className="format-label">
              {format.format}: {count} ({format.share}%)
            </div>
            <div
              className="format-bar"
              style={{
                width: `${width}%`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
