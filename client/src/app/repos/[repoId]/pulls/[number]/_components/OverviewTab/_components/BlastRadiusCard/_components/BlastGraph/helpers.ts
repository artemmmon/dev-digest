import type { BlastDownstream } from "../../helpers";

/** Graph geometry (px). Columns: changed symbol → callers → endpoints/crons. */
export const GRAPH = {
  rootX: 70,
  callerX: 290,
  leafX: 500,
  pitch: 28,
  pad: 12,
  nodeH: 26,
  rootW: 100,
  callerW: 130,
  leafW: 150,
  maxLabel: 16,
  width: 590,
} as const;

export type GraphNodeKind = "root" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  key: string;
  kind: GraphNodeKind;
  x: number;
  y: number;
  width: number;
  /** Cut to `GRAPH.maxLabel` chars with an ellipsis. */
  label: string;
  /** Untruncated text for the SVG `<title>`. */
  title: string;
}

export interface GraphEdge {
  key: string;
  from: GraphNode;
  to: GraphNode;
  /** Root → endpoint edges are drawn fainter (attribution is per symbol, not per caller). */
  faint: boolean;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function truncateLabel(text: string, max: number = GRAPH.maxLabel): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Centre `count` rows of `pitch` inside `height`; returns the y of row `i`. */
function rowY(i: number, count: number, height: number): number {
  return (height - count * GRAPH.pitch) / 2 + GRAPH.pitch * i + GRAPH.pitch / 2;
}

/** Node-link layout for one changed symbol; height grows with the tallest column. */
export function graphLayout(item: BlastDownstream): GraphLayout {
  const leaves = [
    ...item.endpoints_affected.map((label) => ({ kind: "endpoint" as const, label })),
    ...item.crons_affected.map((label) => ({ kind: "cron" as const, label })),
  ];
  const rows = Math.max(item.callers.length, leaves.length, 1);
  const height = rows * GRAPH.pitch + GRAPH.pad * 2;

  const root: GraphNode = {
    key: `root:${item.symbol}`,
    kind: "root",
    x: GRAPH.rootX,
    y: height / 2,
    width: GRAPH.rootW,
    label: truncateLabel(item.symbol),
    title: item.symbol,
  };
  const callers: GraphNode[] = item.callers.map((c, i) => ({
    key: `caller:${c.file}:${c.line}:${c.name}`,
    kind: "caller",
    x: GRAPH.callerX,
    y: rowY(i, item.callers.length, height),
    width: GRAPH.callerW,
    label: truncateLabel(c.name),
    title: `${c.name} — ${c.file}:${c.line}`,
  }));
  const leafNodes: GraphNode[] = leaves.map((l, i) => ({
    key: `${l.kind}:${l.label}`,
    kind: l.kind,
    x: GRAPH.leafX,
    y: rowY(i, leaves.length, height),
    width: GRAPH.leafW,
    label: truncateLabel(l.label),
    title: l.label,
  }));

  const edges: GraphEdge[] = [
    ...leafNodes.map((to) => ({ key: `${root.key}>${to.key}`, from: root, to, faint: true })),
    ...callers.map((to) => ({ key: `${root.key}>${to.key}`, from: root, to, faint: false })),
  ];
  return { width: GRAPH.width, height, nodes: [root, ...callers, ...leafNodes], edges };
}
