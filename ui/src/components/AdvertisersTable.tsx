import type { Advertiser } from "../types";

type Props = {
  advertisers: Advertiser[];
};

export default function AdvertisersTable({ advertisers }: Props) {
  return (
    <div style={{ marginTop: "12px" }}>
      <h4>Advertisers</h4>

      <ul style={{ paddingLeft: "16px" }}>
        {advertisers.map((adv) => (
          <li key={adv.advertiser_id}>
            <strong>{adv.name}</strong>{" "}
            {adv.is_primary && "(primary)"} —{" "}
            {adv.ad_count_estimate} ads
          </li>
        ))}
      </ul>
    </div>
  );
}
