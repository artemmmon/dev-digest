/* Route error boundary — catches a render/effect throw anywhere below the root
   layout, so a crash shows a recoverable screen inside the app instead of the
   default Next.js error page. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      fullScreen
      title={t("errorBoundary.title")}
      body={t("errorBoundary.body")}
      onRetry={reset}
    />
  );
}
