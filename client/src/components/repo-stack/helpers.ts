/* Pure formatting for a repo's auto-detected stack (`Repo.stack`). */
import type { Repo } from "@/lib/types";

type RepoStack = NonNullable<Repo["stack"]>;

/**
 * One-line summary, e.g. `"Flutter +2 · Dart 92% Kotlin 5% · flutter_bloc, freezed, dio"`.
 * `null` when there's genuinely nothing to show (detection ran and found nothing, or
 * hasn't run at all — the caller tells those two apart via the raw `stack` value).
 */
export function formatStack(stack: RepoStack | null | undefined): string | null {
  if (!stack) return null;
  const { frameworks, languages, packages } = stack;
  if (frameworks.length === 0 && languages.length === 0 && packages.length === 0) return null;

  const segments: string[] = [];
  if (frameworks.length > 0) {
    const extra = frameworks.length > 1 ? ` +${frameworks.length - 1}` : "";
    segments.push(`${frameworks[0]!.name}${extra}`);
  }
  if (languages.length > 0) {
    segments.push(languages.map((l) => `${l.name} ${Math.round(l.share * 100)}%`).join(" "));
  }
  if (packages.length > 0) segments.push(packages.join(", "));
  return segments.join(" · ");
}

/** Just the primary framework, e.g. for a compact spot like the repo switcher. */
export function primaryFramework(stack: RepoStack | null | undefined): string | null {
  return stack?.frameworks[0]?.name ?? null;
}

/** Comma list of every OTHER detected framework, for a "+N" chip's tooltip. */
export function otherFrameworks(stack: RepoStack | null | undefined): string | null {
  if (!stack || stack.frameworks.length <= 1) return null;
  return stack.frameworks
    .slice(1)
    .map((f) => f.name)
    .join(", ");
}
