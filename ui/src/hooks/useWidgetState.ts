import { useState } from "react";
import type { AdsSummaryResponse } from "../types";

export function useWidgetState() {
  const [data, setData] = useState<AdsSummaryResponse | null>(null);

  // TODO: Wire this hook to MCP tool output events.
  return { data, setData };
}
