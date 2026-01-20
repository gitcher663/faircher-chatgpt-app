import React from "react";
import { AdsSummaryCard } from "./components/AdsSummaryCard";
import { EmptyState } from "./components/EmptyState";
import type { AdsSummaryResponse } from "./types";

declare global {
  interface Window {
    openai?: {
      toolOutput?: AdsSummaryResponse;
    };
  }
}

export default function App() {
  const data = window.openai?.toolOutput;

  if (!data || !data.summary || !data.summary.is_running_ads) {
    return <EmptyState />;
  }

  return (
    <div>
      <AdsSummaryCard data={data} />
    </div>
  );
}
