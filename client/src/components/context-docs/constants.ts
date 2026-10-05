import type { ProjectDocType } from "@devdigest/shared";

/** Attached + inherited tokens above this show the "over soft cap" warning; attaching still works. */
export const CONTEXT_TOKEN_SOFT_CAP = 4000;

/** Width of the document preview drawer. */
export const DRAWER_WIDTH = 560;

/** Badge colour per document type (from the design's context_docs.jsx). */
export const DOC_TYPE_COLOR: Record<ProjectDocType, string> = {
  specs: "var(--accent)",
  docs: "#10b981",
  insights: "#f59e0b",
};
