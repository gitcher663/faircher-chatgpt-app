import { AdsSummaryOutput } from "./types";
import AdsSummaryCard from "./components/AdsSummaryCard";
import DistributionBar from "./components/DistributionBar";
import AdvertisersTable from "./components/AdvertisersTable";
import EmptyState from "./components/EmptyState";

export default function App() {
  const data = (window as any).openai?.toolOutput as AdsSummaryOutput | null;

  if (!data) {
    return null;
  }

  if (data.summary.is_running_ads === false) {
    return <EmptyState />;
  }

  return (
    <div>
      <AdsSummaryCard summary={data.summary} domain={data.domain} />

      {data.distribution && (
        <DistributionBar formats={data.distribution.formats} />
      )}

      {data.advertisers.length > 0 && (
        <AdvertisersTable advertisers={data.advertisers} />
      )}
    </div>
  );
}
