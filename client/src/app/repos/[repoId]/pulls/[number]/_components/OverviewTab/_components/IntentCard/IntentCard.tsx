/* IntentCard — PR Overview "INTENT" card (spec 08). Renders first on the Overview tab,
   before the description: the derived summary, in/out-of-scope columns, risk-area chips
   (rule- and model-origin, both plain text), a confidence badge, a missing-context marker,
   a stale note and the Derive / Re-derive action. All intent text is rendered as plain
   text — never links or HTML (D13, "treat as low-trust hints"). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel, Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import { usePrIntent, useDeriveIntent } from "@/lib/hooks/intent";
import {
  basisMessageKey,
  missingContextSources,
  riskAreaIcon,
  riskAreaMessageKey,
  shortSha,
  sourceKindMessageKey,
  sourceStatusMessageKey,
  tierMessageKey,
} from "./helpers";
import { s } from "./styles";

export function IntentCard({ prId, headSha }: { prId: string; headSha?: string | null }) {
  const t = useTranslations("intent");
  const { data, isPending, isError, refetch } = usePrIntent(prId, headSha);
  const derive = useDeriveIntent(prId);

  if (isPending) {
    return (
      <section>
        <SectionLabel icon="Target">{t("card.label")}</SectionLabel>
        <Skeleton height={160} />
      </section>
    );
  }

  // A failed GET must not look like "no intent yet" — that would invite a paid
  // derive for a PR whose intent may well exist.
  if (isError) {
    return (
      <section>
        <SectionLabel icon="Target">{t("card.label")}</SectionLabel>
        <div style={s.card}>
          <ErrorState
            title={t("card.errorTitle")}
            body={t("card.errorBody")}
            onRetry={() => void refetch()}
          />
        </div>
      </section>
    );
  }

  const intent = data?.intent ?? null;
  const missing = intent ? missingContextSources(intent.sources) : [];
  const sha = shortSha(intent?.head_sha);
  const incidental = intent?.incidental_changes ?? [];

  return (
    <section>
      <SectionLabel icon="Target">{t("card.label")}</SectionLabel>
      <div style={s.card} aria-live="polite">
        {intent ? (
          <>
            <p style={s.summary}>&ldquo;{intent.summary}&rdquo;</p>

            <div style={s.columns}>
              <div>
                <div style={s.columnLabel(true)}>
                  <Icon.Check size={13} />
                  {t("card.inScope")}
                </div>
                <ul style={s.list}>
                  {intent.in_scope.map((item, i) => (
                    <li key={i} style={s.listItem(true)}>
                      <span aria-hidden style={s.bullet(true)}>
                        ·
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div style={s.columnLabel(false)}>
                  <Icon.X size={13} />
                  {t("card.outOfScope")}
                </div>
                <ul style={s.list}>
                  {intent.out_of_scope.map((item, i) => (
                    <li key={i} style={s.listItem(false)}>
                      <span aria-hidden style={s.bullet(false)}>
                        ·
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {intent.risk_areas.length > 0 && (
              <div>
                <div style={s.risksLabel}>{t("card.riskAreas")}</div>
                <div style={s.riskChips}>
                  {intent.risk_areas.map((risk, i) => {
                    const kindLabel = t(riskAreaMessageKey(risk.kind));
                    return (
                      <span
                        key={`${risk.origin}-${risk.kind}-${i}`}
                        title={`${kindLabel}: ${risk.label}`}
                        aria-label={`${kindLabel}: ${risk.label}`}
                      >
                        <Badge icon={riskAreaIcon(risk.kind)}>{risk.label}</Badge>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {incidental.length > 0 && (
              <div>
                <div style={s.risksLabel}>{t("card.incidental")}</div>
                <ul style={s.list}>
                  {incidental.map((change, i) => (
                    <li key={`${change.path}-${change.start_line}-${i}`} style={s.listItem(false)}>
                      <span aria-hidden style={s.bullet(false)}>
                        ·
                      </span>
                      <span>
                        <span className="mono" style={s.incidentalPath}>
                          {change.path}:{change.start_line}–{change.end_line}
                        </span>
                        {change.reason ? ` — ${change.reason}` : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={s.footer}>
              <Badge icon="Gauge">
                {t(tierMessageKey(intent.confidence_tier))} · {t(basisMessageKey(intent.basis))}
              </Badge>
              {data?.stale && sha && <span style={s.stale}>{t("card.stale", { sha })}</span>}
              <Button
                kind="secondary"
                size="sm"
                icon="RefreshCw"
                loading={derive.isPending}
                onClick={() => derive.mutate()}
              >
                {t("card.rederive")}
              </Button>
            </div>

            {intent.missing_context && missing.length > 0 && (
              <div style={s.missingContext}>
                {t("card.missingContext")}:{" "}
                {missing
                  .map(
                    (source) =>
                      `${t(sourceKindMessageKey(source.kind))} ${source.ref}: ${t(
                        sourceStatusMessageKey(source.status),
                      )}`,
                  )
                  .join(", ")}
              </div>
            )}
          </>
        ) : (
          <div style={s.empty}>
            <p style={s.emptyText}>{t("card.emptyBody")}</p>
            <Button
              kind="secondary"
              icon="Target"
              loading={derive.isPending}
              onClick={() => derive.mutate()}
            >
              {t("card.derive")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
