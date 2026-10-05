/** Where the viewer should land: a file of the PR and, optionally, one new-side line of it.
    A plain prop so `components/` never imports from `src/app`. */
export interface DiffFocus {
  path: string;
  /** A positive integer (new-side line number), or null for "just the file". */
  line: number | null;
}

/** Identity of a focus value — a manual collapse is remembered together with it. */
export function focusKey(focus: DiffFocus | undefined): string {
  return focus ? `${focus.path}\u0000${focus.line ?? ""}` : "";
}
