/* SkillsTab — one ordered list of every workspace skill. The list order is the prompt order:
   the skills this agent uses come first (a switch per row), then the ones it does not. Only the
   enabled block can be re-ordered — a disabled row is not draggable, cannot be a drop target and
   has no keyboard grip; switching a row on moves it to the end of the enabled block, off to the
   start of the disabled one. Every change replaces the agent's bindings on the server with the
   WHOLE list; the server versions the agent only when the enabled, ordered set changes. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton, Toggle } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { SkillTypeChip } from "@/components/skill-type-chip";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import {
  countActive,
  matchesFilter,
  moveBinding,
  moveBindingTo,
  orderedBindings,
  setBindingEnabled,
  type Binding,
} from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const skillsQ = useSkills();
  const linksQ = useAgentSkills(agent.id);
  const save = useSetAgentSkills(agent.id);
  const [filter, setFilter] = React.useState("");
  // Native HTML5 drag-and-drop over the list. Indexes are positions in the FULL list
  // (not the filtered view), so a drop lands where the prompt order says.
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dropAt, setDropAt] = React.useState<number | null>(null);
  const clearDrag = () => {
    setDragFrom(null);
    setDropAt(null);
  };
  // A keyboard move re-orders the DOM, which can drop focus from the grip that was pressed.
  const grips = React.useRef(new Map<string, HTMLButtonElement>());
  const refocus = React.useRef<string | null>(null);
  React.useLayoutEffect(() => {
    if (refocus.current) grips.current.get(refocus.current)?.focus();
    refocus.current = null;
  });

  if (skillsQ.isError || linksQ.isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void skillsQ.refetch();
          void linksQ.refetch();
        }}
      />
    );
  }
  if (!skillsQ.data || !linksQ.data) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={200} />
        <Skeleton height={180} />
      </div>
    );
  }

  const skills = skillsQ.data;
  const byId = new Map<string, Skill>(skills.map((sk) => [sk.id, sk]));
  const list = orderedBindings(linksQ.data, skills);
  const apply = (next: Binding[]) => {
    if (next !== list) save.mutate(next);
  };
  const canDrag = !save.isPending;
  const dropEdge = (i: number): "top" | "bottom" | null => {
    if (dragFrom === null || dropAt !== i || dropAt === dragFrom) return null;
    return dropAt < dragFrom ? "top" : "bottom";
  };
  const moveWithKey = (e: React.KeyboardEvent, id: string, i: number) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    if (!canDrag) return;
    const next = moveBinding(list, i, e.key === "ArrowUp" ? -1 : 1);
    if (next !== list) refocus.current = id;
    apply(next);
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: countActive(list, skills), total: skills.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.orderHint}>{t("skills.orderHint")}</p>

      {skills.length === 0 ? (
        <div style={s.empty}>
          {t("skills.noSkills")}
          <Link href="/skills?create=1">{t("skills.create")}</Link>
        </div>
      ) : (
        <ul style={s.list} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropAt(null)}>
          {list.map((b, i) => {
            const sk = byId.get(b.skill_id)!;
            if (!matchesFilter(sk, filter)) return null;
            return (
              <li
                key={sk.id}
                data-testid={`skill-row-${sk.id}`}
                draggable={canDrag && b.enabled}
                onDragStart={(e) => {
                  if (!b.enabled) return;
                  // Firefox starts a drag only once data is set; jsdom has no dataTransfer.
                  e.dataTransfer?.setData("text/plain", sk.id);
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                  setDragFrom(i);
                }}
                onDragOver={(e) => {
                  // A disabled row is not a drop target: no preventDefault, so the browser refuses the drop.
                  if (dragFrom === null || !b.enabled) return;
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                  if (dropAt !== i) setDropAt(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null && b.enabled) apply(moveBindingTo(list, dragFrom, i));
                  clearDrag();
                }}
                onDragEnd={clearDrag}
                style={{ ...s.row(b.enabled), ...s.dragRow(dragFrom === i, dropEdge(i)) }}
              >
                {b.enabled ? (
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) grips.current.set(sk.id, el);
                      else grips.current.delete(sk.id);
                    }}
                    aria-label={t("skills.moveHandle", { name: sk.name })}
                    title={t("skills.dragHandle")}
                    onKeyDown={(e) => moveWithKey(e, sk.id, i)}
                    style={s.grip(canDrag)}
                  >
                    <Icon.Menu size={14} />
                  </button>
                ) : (
                  <span aria-hidden="true" title={t("skills.dragLocked")} style={s.gripLocked}>
                    <Icon.Menu size={14} />
                  </span>
                )}
                <div style={s.nameCell} title={sk.description}>
                  <span className="mono" style={s.name}>
                    {sk.name}
                  </span>
                </div>
                <SkillTypeChip type={sk.type} compact />
                {!sk.enabled && (
                  <span title={t("skills.globallyOffTitle")}>
                    <Badge color="var(--warn)" bg="var(--warn-bg)">
                      {t("skills.globallyOff")}
                    </Badge>
                  </span>
                )}
                <Toggle
                  on={b.enabled}
                  size={14}
                  label={t("skills.toggleLabel", { name: sk.name })}
                  onChange={(enabled) => canDrag && apply(setBindingEnabled(list, sk.id, enabled))}
                />
              </li>
            );
          })}
          {list.every((b) => !matchesFilter(byId.get(b.skill_id)!, filter)) && (
            <li style={s.muted}>{t("skills.noMatch", { q: filter.trim() })}</li>
          )}
        </ul>
      )}
    </div>
  );
}
