import type { SmartDiffRole } from "@devdigest/shared";

/** Per-role label/description i18n keys (namespace "prReview"), header colour and
    whether the group starts expanded. Colours mirror the design's severity-style
    palette; docs/boilerplate start collapsed (Design deviation 3). */
export const ROLE_META: Record<
  SmartDiffRole,
  { labelKey: string; descKey: string; color: string; defaultOpen: boolean }
> = {
  core: {
    labelKey: "smartDiff.coreLabel",
    descKey: "smartDiff.coreDesc",
    color: "var(--accent)",
    defaultOpen: true,
  },
  tests: {
    labelKey: "smartDiff.testsLabel",
    descKey: "smartDiff.testsDesc",
    color: "var(--ok)",
    defaultOpen: true,
  },
  wiring: {
    labelKey: "smartDiff.wiringLabel",
    descKey: "smartDiff.wiringDesc",
    color: "var(--warn)",
    defaultOpen: true,
  },
  docs: {
    labelKey: "smartDiff.docsLabel",
    descKey: "smartDiff.docsDesc",
    color: "var(--info)",
    defaultOpen: false,
  },
  boilerplate: {
    labelKey: "smartDiff.boilerplateLabel",
    descKey: "smartDiff.boilerplateDesc",
    color: "var(--text-muted)",
    defaultOpen: false,
  },
};
