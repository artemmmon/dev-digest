"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { useBlastResync } from "@/lib/hooks/blast";
import type { BlastReasonKey } from "../../helpers";
import { s } from "./styles";

interface BlastDegradedNoticeProps {
  prId: string;
  repoId: string;
  reason: BlastReasonKey;
}

/** Why the map is missing or partial, plus a Resync action (hidden when indexing is off). */
export function BlastDegradedNotice({ prId, repoId, reason }: BlastDegradedNoticeProps) {
  const t = useTranslations("blast");
  const resync = useBlastResync(prId, repoId);

  return (
    <div style={s.box} role="status">
      <Icon.AlertTriangle size={15} style={s.icon} />
      <div style={s.text}>
        <div style={s.title}>{t("degraded.title")}</div>
        <div style={s.reason}>{t(`degraded.reason.${reason}`)}</div>
        {resync.timedOut && <div style={s.reason}>{t("degraded.resyncTimeout")}</div>}
        {resync.failed && <div style={s.reason}>{t("degraded.resyncFailed")}</div>}
      </div>
      {reason !== "flag_off" && (
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          loading={resync.pending}
          disabled={resync.pending}
          onClick={resync.start}
        >
          {resync.pending ? t("degraded.resyncing") : t("degraded.resync")}
        </Button>
      )}
    </div>
  );
}
