import type { AdsSummaryOutput } from "../types";

type Props = {
  formats: AdsSummaryOutput["ad_format_mix"];
};

export default function DistributionBar({ formats }: Props) {
  const max = Math.max(0, ...formats.map(item => item.count));

  return (
    <div style={{ marginTop: "12px" }}>
      <h4>Ad formats</h4>

      {formats.map(format => {
        const count = format.count;
        const width = max > 0 ? (count / max) * 100 : 0;

        return (
          <div key={format.format} style={{ marginBottom: "6px" }}>
            <div style={{ fontSize: "12px" }}>
              {format.format}: {count} ({format.share}%)
            </div>
            <div
              style={{
                height: "6px",
                width: `${width}%`,
                backgroundColor: "#888",
                borderRadius: "3px",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
