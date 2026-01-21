import type { Distribution } from "../types";

type Props = {
  distribution: Distribution;
};

export default function DistributionBar({ distribution }: Props) {
  const formats = distribution.formats;
  const max = Math.max(...Object.values(formats));

  return (
    <div style={{ marginTop: "12px" }}>
      <h4>Ad formats</h4>

      {Object.entries(formats).map(([format, count]) => {
        const width = max > 0 ? (count / max) * 100 : 0;

        return (
          <div key={format} style={{ marginBottom: "6px" }}>
            <div style={{ fontSize: "12px" }}>
              {format}: {count}
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
