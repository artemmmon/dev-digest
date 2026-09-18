/* RunStatus — live SSE status for in-flight review runs. Subscribes to the
   run event streams and renders the shared LiveLogStream. */
"use client";

import { useTranslations } from "next-intl";
import { LiveLogStream, type LogLine } from "@devdigest/ui";
import type { RunEvent } from "@devdigest/shared";
import { useRunEvents } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import { LOG_HEIGHT } from "./constants";
import { s } from "./styles";

/**
 * Runtime agent failures arrive as SSE `error` events, not as a query/mutation
 * error, so the global error toast never sees them — surface them here so the
 * user is told without a reload.
 */
function toastRunError(event: RunEvent) {
  if (event.kind === "error" && event.msg) notify.error(event.msg);
}

export function RunStatus({
  runIds,
  onDone,
}: {
  runIds: string[];
  /** Called once when the streams end (the runs settled). */
  onDone?: () => void;
}) {
  const t = useTranslations("prReview");
  const { events, running } = useRunEvents(runIds, { onEvent: toastRunError, onSettled: onDone });

  if (runIds.length === 0) return null;

  const log: LogLine[] = events.map((e) => ({
    t: e.t,
    k: e.kind as LogLine["k"],
    m: e.msg,
  }));

  return (
    <div style={s.wrap}>
      <LiveLogStream
        log={log}
        running={running}
        height={LOG_HEIGHT}
        elapsedLabel={running ? t("runStatus.elapsed", { count: runIds.length }) : undefined}
      />
    </div>
  );
}
