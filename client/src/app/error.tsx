"use client";

import React from "react";
import { ErrorState } from "@devdigest/ui";

/* Route-level error boundary. Catches render/data errors thrown by a route and
   offers a retry that re-renders the segment (react-error-boundary style). */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      fullScreen
      title="Something went wrong"
      body={error.message || "An unexpected error occurred while rendering this page."}
      onRetry={reset}
    />
  );
}
