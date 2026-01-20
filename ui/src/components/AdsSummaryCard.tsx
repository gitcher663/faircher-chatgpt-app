import React from "react";
import type { AdsSummaryResponse } from "../types";

type Props = {
  data: AdsSummaryResponse;
};

export function AdsSummaryCard({ data }: Props) {
  const { domain, summary } = data;

  return (
    <div style={{ padding: "12px" }}>
      <h3>{domain}</h3>

      <p>
        <strong>Status:</strong>{" "}
        {summary.is_running_ads ? "Running ads" : "No ads detected"}
      </p>

      <p>
        <strong>Total ads found:</strong> {summary.total_ads_found}
      </p>

      <p>
        <strong>Active advertisers:</strong> {summary.active_advertisers}
      </p>

      {summary.primary_advertiser && (
        <p>
          <strong>Primary advertiser:</strong>{" "}
          {summary.primary_advertiser}
        </p>
      )}
    </div>
  );
}
