import { AdsSummaryOutput } from "./types";
import AdsSummaryCard from "./components/AdsSummaryCard";
import EmptyState from "./components/EmptyState";

export default function App() {
  const data = (window as any).openai?.toolOutput as AdsSummaryOutput | null;

  if (!data) {
    return null;
  }

  if (data.advertising_activity_snapshot.status === "Inactive") {
    return <EmptyState />;
  }

  return (
    <div>
      <AdsSummaryCard data={data} />
    </div>
  );
}
