import { useEffect, useState } from "react";
import { AdsSummaryOutput } from "./types";
import AdsSummaryCard from "./components/AdsSummaryCard";
import EmptyState from "./components/EmptyState";

export default function App() {
  const data = (window as any).openai?.toolOutput as AdsSummaryOutput | null;
  const initialDetails =
    (window as any).openai?.widgetState?.showDetails ?? true;
  const [showDetails, setShowDetails] = useState<boolean>(initialDetails);

  useEffect(() => {
    (window as any).openai?.setWidgetState?.({ showDetails });
  }, [showDetails]);

  if (!data) {
    return null;
  }

  if (data.advertising_activity_snapshot.status === "Inactive") {
    return <EmptyState />;
  }

  return (
    <div>
      <AdsSummaryCard
        data={data}
        showDetails={showDetails}
        onToggleDetails={() => setShowDetails(prev => !prev)}
      />
    </div>
  );
}
