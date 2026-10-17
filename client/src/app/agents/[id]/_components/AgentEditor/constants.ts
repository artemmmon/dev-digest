import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace, or under `ns` when set. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
  /** Translation namespace of `labelKey` when it is not `agents` (the tab's feature owns its label). */
  ns?: "eval";
}

/** Editor tabs. Later lessons add Stats / CI. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "context", labelKey: "editor.tabs.context", icon: "Folder" },
  { key: "evals", labelKey: "evalsTab.tabLabel", icon: "Gauge", ns: "eval" },
];
