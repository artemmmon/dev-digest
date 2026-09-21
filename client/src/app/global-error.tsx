/* Last-resort boundary for a throw in the root layout itself. It replaces the
   layout, so there are no providers here (no next-intl, no theme) — strings come
   straight from the message file and the page brings its own <html>/<body>. */
"use client";

import React from "react";
import { ErrorState } from "@devdigest/ui";
import common from "../../messages/en/common.json";
import "./globals.css";

export default function GlobalError({
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
    <html lang="en" data-theme="dark" data-density="regular">
      <body>
        <ErrorState
          fullScreen
          title={common.errorBoundary.title}
          body={common.errorBoundary.body}
          onRetry={reset}
        />
      </body>
    </html>
  );
}
