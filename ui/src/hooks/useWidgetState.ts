import { useState } from "react";
import type { AdsSummaryOutput } from "../types";

export function useWidgetState() {
  const [data, setData] = useState<AdsSummaryOutput | null>(null);

  // TODO: Wire this hook to MCP tool output events.
  return { data, setData };
}
