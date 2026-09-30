/* BlastTree — one collapsible row per changed symbol that has callers. Symbol names, paths and
   endpoints come from the indexed repo (untrusted): rendered as JSX text only, and caller links
   go through `githubBlobUrl` + `MonoLink`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastDownstream } from "../../helpers";
import { s } from "./styles";

interface BlastTreeProps {
  downstream: BlastDownstream[];
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
}

/** `file:line` split into `/`-terminated segments with a <wbr/> between them: the only places the
    path may wrap. The text content stays exactly `file:line` (link name, copy-paste). */
function PathLabel({ file, line }: { file: string; line: number }) {
  const parts = file.split("/");
  const segments = parts.map((part, i) => (i < parts.length - 1 ? `${part}/` : `${part}:${line}`));
  return (
    <>
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && <wbr />}
          <span style={s.refSegment}>{seg}</span>
        </React.Fragment>
      ))}
    </>
  );
}

export function BlastTree({ downstream, repoFullName, headSha }: BlastTreeProps) {
  const t = useTranslations("blast");
  // Only the rows the user toggled are stored; the first row is open until touched.
  const [toggled, setToggled] = React.useState<Record<string, boolean>>({});

  return (
    <div style={s.list}>
      {downstream.map((item, index) => {
        const open = toggled[item.symbol] ?? index === 0;
        return (
          <div key={item.symbol}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setToggled((prev) => ({ ...prev, [item.symbol]: !open }))}
              style={s.header(open)}
            >
              <Icon.ChevronRight size={13} style={s.chevron(open)} />
              <Icon.Code size={13} style={s.codeIcon} />
              <span className="mono" style={s.symbol}>
                {item.symbol}
              </span>
              <span style={s.count}>{t("callerCount", { count: item.callers.length })}</span>
            </button>

            {open && (
              <div style={s.body}>
                {item.callers.map((c) => (
                  <div key={`${c.file}:${c.line}:${c.name}`} style={s.caller}>
                    <Icon.CornerDownRight size={13} style={s.callerIcon} />
                    <div style={s.callerBody}>
                      <span className="mono" style={s.callerName}>
                        {c.name}
                      </span>
                      <span style={s.ref} title={`${c.file}:${c.line}`}>
                        {repoFullName && headSha ? (
                          <MonoLink href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}>
                            <PathLabel file={c.file} line={c.line} />
                          </MonoLink>
                        ) : (
                          <span className="mono" style={s.plainRef}>
                            <PathLabel file={c.file} line={c.line} />
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
                {item.endpoints_affected.length > 0 && (
                  <div style={s.chips} role="group" aria-label={t("tree.endpoints")}>
                    {item.endpoints_affected.map((e) => (
                      <Badge key={e} mono icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)" style={s.chip}>
                        {e}
                      </Badge>
                    ))}
                  </div>
                )}
                {item.crons_affected.length > 0 && (
                  <div style={s.chips} role="group" aria-label={t("tree.crons")}>
                    {item.crons_affected.map((e) => (
                      <Badge key={e} mono icon="Clock" color="var(--warn)" bg="var(--warn-bg)" style={s.chip}>
                        {e}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
