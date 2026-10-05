"use client";

import React from "react";
import { COPY_FEEDBACK_MS } from "../constants";

/** Write `text` to the clipboard; false when the clipboard is unavailable or refuses. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copy a text and remember, for a moment, which control ("key") copied it and whether it worked. */
export function useCopyFeedback() {
  const [result, setResult] = React.useState<{ key: string; ok: boolean } | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const copy = React.useCallback(async (key: string, text: string) => {
    const ok = await copyToClipboard(text);
    setResult({ key, ok });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), COPY_FEEDBACK_MS);
  }, []);

  return { result, copy };
}
