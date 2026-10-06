import type { Tour, TourComplexity, TourSectionKind } from "@devdigest/shared";
import { stripImageEmbeds } from "@/lib/strip-image-embeds";

export type TourSection = Tour["sections"][number];

export { stripImageEmbeds };

/** True when a section has no items and no text (the card then says "Nothing found for this section"). */
export function isSectionEmpty(section: TourSection): boolean {
  switch (section.kind) {
    case "architecture_overview":
      return section.body.trim() === "" && (section.diagram ?? "").trim() === "";
    case "critical_paths":
      return section.files.length === 0;
    case "how_to_run":
      return section.steps.length === 0;
    case "guided_reading":
      return section.reading.length === 0;
    case "first_tasks":
      return section.tasks.length === 0;
  }
}

/** Fixed strings the markdown export needs; the caller reads them from the message catalogue. */
export interface TourMarkdownLabels {
  heading: string;
  sections: Record<TourSectionKind, string>;
  empty: string;
  source: string;
  complexity: Record<TourComplexity, string>;
}

/** A run of backticks longer than any inside `text`, so the text cannot close its own code span or fence. */
function backticks(text: string, atLeast: number): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(atLeast, longest + 1));
}

function inlineCode(text: string): string {
  const ticks = backticks(text, 1);
  // Markdown strips one space from each side of a code span, so a text that starts or ends with a backtick is padded.
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

function fenced(text: string, lang: string): string {
  const fence = backticks(text, 3);
  return `${fence}${lang}\n${text}\n${fence}`;
}

/** The whole tour as one markdown text: the title, then the five sections in order, every item of each. */
export function tourToMarkdown(tour: Tour, repoName: string, labels: TourMarkdownLabels): string {
  const out: string[] = [`# ${labels.heading} ${repoName}`];
  for (const section of tour.sections) {
    out.push(`## ${labels.sections[section.kind]}`);
    if (isSectionEmpty(section)) {
      out.push(labels.empty);
      continue;
    }
    switch (section.kind) {
      case "architecture_overview":
        if (section.body.trim()) out.push(stripImageEmbeds(section.body).trim());
        if (section.diagram?.trim()) out.push(fenced(section.diagram.trim(), "mermaid"));
        break;
      case "critical_paths":
        out.push(section.files.map((f) => `- ${inlineCode(f.path)} — ${f.note}`).join("\n"));
        break;
      case "how_to_run":
        out.push(
          section.steps
            .map((s, i) => `${i + 1}. ${inlineCode(s.command)}\n   ${labels.source}: ${inlineCode(s.source)}`)
            .join("\n"),
        );
        break;
      case "guided_reading":
        out.push(section.reading.map((r, i) => `${i + 1}. ${inlineCode(r.path)}\n   ${r.why}`).join("\n"));
        break;
      case "first_tasks":
        out.push(
          section.tasks
            .map((task) => `- **${task.title}** — ${inlineCode(task.scope)} (${labels.complexity[task.complexity]})`)
            .join("\n"),
        );
        break;
    }
  }
  return `${out.join("\n\n")}\n`;
}

/** The tour is out of date when the repository has an indexed commit and it differs from the tour's. */
export function isTourStale(indexedSha: string | null | undefined, tourSha: string): boolean {
  return typeof indexedSha === "string" && indexedSha !== "" && indexedSha !== tourSha;
}
