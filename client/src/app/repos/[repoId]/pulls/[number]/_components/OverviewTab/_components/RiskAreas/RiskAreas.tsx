/* RiskAreas — the "Risk areas" list below the Intent and Blast radius cards (spec 12): each
   risk with its kind icon in the severity colour, its title and first file reference, and an
   expand button for the explanation and every reference. Titles and paths are plain text; the
   explanation goes through the kit Markdown (no raw HTML) after image embeds are stripped. A
   file reference is only compared with the PR's file list by `onOpenFile`, never turned into a link. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown, MonoLink, SectionLabel } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { stripImageEmbeds } from "@/lib/strip-image-embeds";
import { riskAreaIcon } from "../../helpers";
import { SEVERITY_COLOR } from "./constants";
import { s } from "./styles";

interface RiskAreasProps {
  risks: Risk[];
  /** Jump to a file in Files changed (or tell the user it is not in the diff). */
  onOpenFile: (file: string) => void;
}

export function RiskAreas({ risks, onOpenFile }: RiskAreasProps) {
  const t = useTranslations("brief");
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);
  const open = openIndex != null ? (risks[openIndex] ?? null) : null;

  return (
    <section aria-labelledby="brief-risk-areas">
      <div id="brief-risk-areas">
        <SectionLabel icon="AlertTriangle">{t("block.riskAreas")}</SectionLabel>
      </div>
      {risks.length === 0 ? (
        <p style={s.empty}>{t("noRisks")}</p>
      ) : (
        <>
          <div style={s.row}>
            {risks.map((risk, i) => {
              const color = SEVERITY_COLOR[risk.severity];
              const expanded = openIndex === i;
              const KindIcon = Icon[riskAreaIcon(risk.kind)];
              const firstRef = risk.file_refs[0];
              const content = (
                <>
                  <span style={s.pillTitle}>
                    <KindIcon size={13} style={{ color }} />
                    {risk.title}
                  </span>
                  {firstRef && (
                    <span className="mono" style={s.pillRef}>
                      {firstRef}
                    </span>
                  )}
                </>
              );
              return (
                <div key={`${risk.kind}-${i}`} style={s.pill(expanded, color)}>
                  {firstRef ? (
                    <button
                      type="button"
                      style={s.pillMain}
                      title={t("risk.jumpTo", { file: firstRef })}
                      onClick={() => onOpenFile(firstRef)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div style={s.pillMain}>{content}</div>
                  )}
                  <button
                    type="button"
                    style={s.expand}
                    aria-expanded={expanded}
                    aria-controls={`brief-risk-${i}`}
                    aria-label={t("risk.why", { title: risk.title })}
                    title={t("risk.why", { title: risk.title })}
                    onClick={() => setOpenIndex(expanded ? null : i)}
                  >
                    <Icon.ChevronDown size={14} style={s.chevron(expanded)} />
                  </button>
                </div>
              );
            })}
          </div>
          {open && openIndex != null && (
            <div id={`brief-risk-${openIndex}`} style={s.panel}>
              <div style={s.explanation}>
                <Markdown>{stripImageEmbeds(open.explanation)}</Markdown>
              </div>
              {open.file_refs.length > 0 && (
                <div style={s.refs} aria-label={t("risk.references")}>
                  {open.file_refs.map((ref, i) => (
                    <MonoLink key={`${ref}-${i}`} onClick={() => onOpenFile(ref)}>
                      {ref}
                    </MonoLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
