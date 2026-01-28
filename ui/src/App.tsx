import { AdsSummaryOutput } from "./types";
import AdsSummaryCard from "./components/AdsSummaryCard";
import EmptyState from "./components/EmptyState";
import { useToolOutput } from "./hooks/useOpenAiGlobal";
import { useWidgetState } from "./hooks/useWidgetState";

export default function App() {
  const data = useToolOutput<AdsSummaryOutput | null>() ?? null;
  const [widgetState, setWidgetState] = useWidgetState<{
    showDetails: boolean;
  }>({ showDetails: true });
  const showDetails = widgetState?.showDetails ?? true;

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
        onToggleDetails={() =>
          setWidgetState(prev => ({
            showDetails: !(prev?.showDetails ?? true),
          }))
        }
      />
    </div>
  );
}
