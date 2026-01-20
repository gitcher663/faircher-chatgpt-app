import React from "react";

export function EmptyState() {
  return (
    <div style={{ padding: "12px" }}>
      <h3>No advertising activity found</h3>
      <p>
        We didn’t detect any recent advertising activity for this domain.
      </p>
    </div>
  );
}
