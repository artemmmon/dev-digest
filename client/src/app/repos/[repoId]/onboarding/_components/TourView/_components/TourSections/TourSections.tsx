/* The five section bodies of the tour. Model text is rendered only through the kit Markdown or as text
   nodes; links are built from the stored repository name, the stored commit and the section's checked path. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, Markdown, MonoLink } from "@devdigest/ui";
import type {
  ArchitectureOverviewSection,
  CriticalPathsSection,
  FirstTasksSection,
  GuidedReadingSection,
  HowToRunSection,
} from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { githubBlobUrl } from "@/lib/github-urls";
import { stripImageEmbeds, type TourSection } from "../../helpers";
import { useCopyFeedback } from "../../hooks/useCopyFeedback";
import { s } from "../../styles";

/** Where a section's file links point: the stored repository (owner/name) at the tour's stored commit. */
interface FileLinks {
  repoName: string;
  commit: string;
}

function OverviewBody({ section }: { section: ArchitectureOverviewSection }) {
  return (
    <>
      {section.body.trim() !== "" && (
        <div style={s.overviewText}>
          {/* The kit Markdown renders `![](url)` as a real <img>; strip embeds so no remote image is fetched. */}
          <Markdown>{stripImageEmbeds(section.body)}</Markdown>
        </div>
      )}
      {/* An unrenderable diagram renders nothing at all (MermaidDiagram), so no wrapper box here. */}
      {section.diagram && (
        <div style={s.diagram}>
          <MermaidDiagram chart={section.diagram} />
        </div>
      )}
    </>
  );
}

function CriticalPathsBody({ section, repoName, commit }: { section: CriticalPathsSection } & FileLinks) {
  const t = useTranslations("onboarding");
  const id = React.useId();
  return (
    <ul style={s.list}>
      {section.files.map((file, i) => (
        <li key={`${file.path}-${i}`} style={s.fileRow}>
          <Icon.FileText size={13} style={s.fileIcon} aria-hidden="true" />
          <span id={`${id}-${i}`} className="mono" style={s.path}>
            {file.path}
          </span>
          <span style={s.note2}>— {file.note}</span>
          <a
            href={githubBlobUrl(repoName, commit, file.path)}
            target="_blank"
            rel="noopener noreferrer"
            aria-describedby={`${id}-${i}`}
            style={s.openLink}
          >
            <Icon.ExternalLink size={12} aria-hidden="true" />
            {t("sections.open")}
          </a>
        </li>
      ))}
    </ul>
  );
}

function HowToRunBody({ section }: { section: HowToRunSection }) {
  const t = useTranslations("onboarding");
  const { result, copy } = useCopyFeedback();
  return (
    <>
      <ol style={s.list}>
        {section.steps.map((step, i) => {
          const key = `step-${i}`;
          const outcome = result?.key === key ? result.ok : null;
          return (
            <li key={`${step.command}-${i}`} style={s.stepRow}>
              <span className="tnum" style={s.stepNumber}>
                {i + 1}
              </span>
              <div style={s.stepBody}>
                <code className="mono" style={s.command}>
                  {step.command}
                </code>
                <div style={s.source}>
                  {t("run.source")}: <span className="mono">{step.source}</span>
                </div>
              </div>
              <div style={s.stepCopy}>
                <span aria-live="polite" style={outcome === false ? s.stepConfirmError : s.stepConfirm}>
                  {outcome === null ? "" : outcome ? t("run.copied") : t("run.copyFailed")}
                </span>
                <IconBtn
                  icon="Copy"
                  size={26}
                  label={t("run.copyStep", { step: i + 1 })}
                  onClick={() => void copy(key, step.command)}
                />
              </div>
            </li>
          );
        })}
      </ol>
      {section.steps.length > 0 && <p style={s.warning}>{t("run.warning")}</p>}
    </>
  );
}

function GuidedReadingBody({ section, repoName, commit }: { section: GuidedReadingSection } & FileLinks) {
  return (
    <ol style={s.list}>
      {section.reading.map((item, i) => (
        <li key={`${item.path}-${i}`} style={s.readingRow}>
          <span className="tnum" style={s.readingNumber}>
            {i + 1}
          </span>
          <div>
            <MonoLink href={githubBlobUrl(repoName, commit, item.path)}>{item.path}</MonoLink>
            <div style={s.why}>{item.why}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function FirstTasksBody({ section }: { section: FirstTasksSection }) {
  const t = useTranslations("onboarding");
  return (
    <ul style={{ ...s.tasks, padding: 0, marginBottom: 0 }}>
      {section.tasks.map((task, i) => (
        <li key={`${task.title}-${i}`} style={s.task}>
          <div style={s.taskTitle}>{task.title}</div>
          <div className="mono" style={s.taskScope}>
            {task.scope}
          </div>
          <Badge bg="transparent" style={s.complexity(task.complexity)}>
            {t(`tasks.complexity.${task.complexity}`)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** The body of whichever section it is given. */
export function TourSectionBody({ section, repoName, commit }: { section: TourSection } & FileLinks) {
  switch (section.kind) {
    case "architecture_overview":
      return <OverviewBody section={section} />;
    case "critical_paths":
      return <CriticalPathsBody section={section} repoName={repoName} commit={commit} />;
    case "how_to_run":
      return <HowToRunBody section={section} />;
    case "guided_reading":
      return <GuidedReadingBody section={section} repoName={repoName} commit={commit} />;
    case "first_tasks":
      return <FirstTasksBody section={section} />;
  }
}
