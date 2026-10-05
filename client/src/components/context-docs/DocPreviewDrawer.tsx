/* DocPreviewDrawer — read-only side panel over a Context list: the document's path, type, used-by
   and token counts (all from the server's list), its text as markdown and, when the caller passes
   `onToggle`, an attach toggle. Which document is open is the caller's business. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, Icon } from "@devdigest/ui";
import type { ProjectDocument } from "@devdigest/shared";
import { useProjectDoc } from "@/lib/hooks/project-context";
import { DOC_TYPE_COLOR, DRAWER_WIDTH } from "./constants";
import { DocContent } from "./DocContent";
import { DocTypeBadge } from "./DocTypeBadge";
import { formatTokens } from "./helpers";
import { s } from "./styles";

export interface DocPreviewDrawerProps {
  repoId: string;
  doc: ProjectDocument;
  attached: boolean;
  /** Absent for a read-only (inherited) document: the drawer then shows no attach toggle. */
  onToggle?: (path: string) => void;
  onClose: () => void;
}

export function DocPreviewDrawer({ repoId, doc, attached, onToggle, onClose }: DocPreviewDrawerProps) {
  const t = useTranslations("context");
  const query = useProjectDoc(repoId, doc.path);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Drawer
      width={DRAWER_WIDTH}
      onClose={onClose}
      title={
        <span style={s.meta}>
          <Icon.FileText size={15} style={{ color: DOC_TYPE_COLOR[doc.type] }} />
          <span className="mono" style={{ fontSize: 14 }}>
            {doc.path}
          </span>
        </span>
      }
      subtitle={
        <span style={s.meta}>
          <DocTypeBadge type={doc.type} />
          <span style={s.metaItem}>
            <Icon.Cpu size={12} />
            {t("usedBy", { count: doc.used_by })}
          </span>
          <span className="mono" style={s.metaItem}>
            {t("tokensShort", { tokens: formatTokens(doc.tokens) })}
          </span>
        </span>
      }
    >
      {onToggle && (
        <div style={s.attachRow}>
          <Button
            kind={attached ? "secondary" : "primary"}
            size="sm"
            icon={attached ? "Check" : "Plus"}
            aria-pressed={attached}
            onClick={() => onToggle(doc.path)}
          >
            {attached ? t("drawer.attached") : t("drawer.attach")}
          </Button>
        </div>
      )}
      <DocContent content={query.data} isPending={query.isPending} isError={query.isError} onRetry={() => void query.refetch()} />
    </Drawer>
  );
}
