/* Agent colours for the Multi-Agent Review screens. An agent has no colour of its own, so one is
   picked by its position (Configure run: the enabled agents; results: the run's columns) from the
   design's persona palette (client/docs/design/src/data.jsx), cycling when there are more agents
   than colours. The same index gets the same colour in Configure, Columns and Tabs. */

export const AGENT_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#10b981"] as const;

/** The colour for the agent at `index` (0-based, cycling). */
export function agentColor(index: number): string {
  const n = AGENT_COLORS.length;
  return AGENT_COLORS[((index % n) + n) % n] as string;
}

/** A translucent tint of a `#rrggbb` colour for backgrounds (hex alpha, 0x1f ≈ 12%). */
export function agentTint(color: string, alpha: "12" | "1f" = "1f"): string {
  return color + alpha;
}
