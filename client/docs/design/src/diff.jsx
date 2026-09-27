/* diff.jsx — Reviewer-Ordered Diff: group headers, file cards, inline code w/ finding markers, split nudger */

// nearest scrollable ancestor + smooth scroll-to (no scrollIntoView — it disrupts the canvas host)
function ddScrollParent(el) {
  let p = el && el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 2) return p;
    p = p.parentElement;
  }
  return null;
}
function ddScrollToEl(el, pad) {
  const sp = ddScrollParent(el);
  if (!sp) return;
  const a = sp.getBoundingClientRect(), b = el.getBoundingClientRect();
  sp.scrollTo({ top: sp.scrollTop + (b.top - a.top) - (pad == null ? 96 : pad), behavior: "smooth" });
}

const ROLE = {
  core: { label: "Core logic", c: "var(--accent)", desc: "The substance of the change — review closely" },
  wiring: { label: "Wiring", c: "var(--warn)", desc: "Hooks the core into the app" },
  boilerplate: { label: "Boilerplate", c: "var(--text-muted)", desc: "Generated / mechanical — skim" },
};

const SEV_WORD = (sv) => (sv === "CRITICAL" ? "blocker" : sv.toLowerCase());

// the finding written out in full, anchored under the line(s) it cites
function InlineFindingComment({ f, onClose }) {
  const s = window.SEV[f.severity];
  const [st, setSt] = React.useState("open");
  const dim = st !== "open";
  const range = f.start_line === f.end_line ? String(f.start_line) : f.start_line + "–" + f.end_line;
  return React.createElement("div", { style: { padding: "2px 12px 8px 58px" } },
    React.createElement("div", { style: { border: "1px solid var(--border)", borderLeft: "3px solid " + (dim ? "var(--border-strong)" : s.c), borderRadius: 8, background: "var(--bg-elevated)", opacity: dim ? 0.62 : 1, transition: "opacity .2s" } },
      React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px 8px" } },
        React.createElement("div", { style: { width: 22, height: 22, borderRadius: 6, background: s.bg, color: s.c, display: "grid", placeItems: "center", flexShrink: 0 } },
          React.createElement(window.Icon[s.icon], { size: 13 })),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: s.c } }, SEV_WORD(f.severity)),
            React.createElement("span", { style: { fontSize: 13, fontWeight: 650, color: "var(--text-primary)" } }, f.title),
            window.CategoryTag && React.createElement(window.CategoryTag, { category: f.category }),
            st === "accepted" && React.createElement(window.Badge, { color: "var(--ok)", bg: "var(--ok-bg)", icon: "Check" }, "Accepted"),
            st === "dismissed" && React.createElement(window.Badge, { color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" }, "Dismissed")),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9, marginTop: 4 } },
            React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--text-muted)" } }, "line " + range),
            window.ConfidenceNum && React.createElement(window.ConfidenceNum, { value: f.confidence }))),
        React.createElement(window.IconBtn, { icon: "X", label: "Collapse comment", onClick: onClose })),
      React.createElement("div", { style: { padding: "0 12px 12px 43px" } },
        React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)", textWrap: "pretty" } }, window.mdLite(f.rationale)),
        f.suggestion && React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 10, padding: "9px 11px", borderRadius: 7, background: "var(--bg-surface)", border: "1px solid var(--border)" } },
          React.createElement(window.Icon.Lightbulb, { size: 13, style: { color: "var(--sugg)", flexShrink: 0, marginTop: 2 } }),
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 3 } }, "Suggested fix"),
            React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)", textWrap: "pretty" } }, window.mdLite(f.suggestion)))),
        React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" } },
          React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Check", onClick: () => setSt(st === "accepted" ? "open" : "accepted") }, "Accept"),
          React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "X", onClick: () => setSt(st === "dismissed" ? "open" : "dismissed") }, "Dismiss")))));
}

function CodeLine({ ln, file, comment, open, onToggle }) {
  const sev = ln.finding ? window.FINDINGS.find((f) => f.id === ln.finding) : null;
  const s = sev ? window.SEV[sev.severity] : null;
  return React.createElement(React.Fragment, null,
    React.createElement("div", {
      "data-diff-anchor": file ? file + ":" + ln.n : undefined,
      style: { display: "flex", alignItems: "stretch", fontSize: 12, lineHeight: "20px", position: "relative",
        background: ln.s === "add" ? "var(--code-add)" : ln.s === "del" ? "var(--code-del)" : "transparent" },
    },
      s && React.createElement("span", { title: sev.title, style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: s.c } }),
      React.createElement("span", { className: "mono tnum", style: { width: 44, textAlign: "right", padding: "0 8px 0 0", color: "var(--text-muted)", userSelect: "none", flexShrink: 0 } }, ln.n),
      React.createElement("span", { className: "mono", style: { width: 14, textAlign: "center", color: ln.s === "add" ? "var(--code-add-text)" : "var(--text-muted)", flexShrink: 0 } }, ln.s === "add" ? "+" : ln.s === "del" ? "−" : ""),
      React.createElement("span", { className: "mono", style: { flex: 1, whiteSpace: "pre", color: "var(--text-primary)", paddingRight: 10 } }, ln.t || " "),
      s && React.createElement("button", {
        onClick: onToggle, title: open ? "Hide this finding" : sev.title,
        style: { display: "inline-flex", alignItems: "center", gap: 4, margin: "1px 8px 1px 0", padding: "0 7px", borderRadius: 5, cursor: "pointer", font: "inherit", fontSize: 10.5, fontWeight: 600, flexShrink: 0,
          border: "1px solid " + (open ? s.c : "transparent"), background: open ? s.bg : "transparent", color: s.c },
      },
        React.createElement(window.Icon[s.icon], { size: 11 }), SEV_WORD(sev.severity))),
    comment && open && React.createElement(InlineFindingComment, { f: sev, onClose: onToggle }));
}

function DiffFileCard({ file, role, navTarget }) {
  const [open, setOpen] = React.useState(file.finding_lines.length > 0);
  const [hidden, setHidden] = React.useState({});
  const lines = window.CODE_SNIPPETS[file.path];
  // one comment per finding — anchored to the last line that cites it
  const anchors = {};
  (lines || []).forEach((ln, i) => { if (ln.finding) anchors[ln.finding] = i; });
  const toggle = (id) => setHidden((h) => ({ ...h, [id]: !h[id] }));
  const hasFinding = file.finding_lines.length > 0;
  const rootRef = React.useRef(null);
  const isTarget = navTarget && navTarget.file === file.path;
  // arriving from a brief deep-link: expand, scroll, pulse the exact line
  React.useEffect(() => {
    if (!isTarget) return;
    setOpen(true);
    const id = setTimeout(() => {
      const root = rootRef.current;
      if (!root) return;
      const lineEl = navTarget.line != null
        ? root.querySelector('[data-diff-anchor="' + file.path + ":" + navTarget.line + '"]')
        : null;
      ddScrollToEl(lineEl || root, lineEl ? 130 : 96);
      if (lineEl) {
        lineEl.classList.remove("dd-line-pulse");
        void lineEl.offsetWidth; // restart the animation
        lineEl.classList.add("dd-line-pulse");
        setTimeout(() => lineEl.classList.remove("dd-line-pulse"), 1700);
      }
    }, 70);
    return () => clearTimeout(id);
  }, [navTarget]);
  return React.createElement("div", { ref: rootRef, "data-file-anchor": file.path, style: { border: "1px solid " + (isTarget ? "var(--accent)" : "var(--border)"), borderRadius: 7, overflow: "hidden", background: "var(--bg-elevated)", transition: "border-color .2s", scrollMarginTop: 130 } },
    React.createElement("div", { onClick: () => setOpen((o) => !o), style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", cursor: "pointer" } },
      React.createElement(window.Icon.ChevronRight, { size: 13, style: { color: "var(--text-muted)", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" } }),
      React.createElement(window.Icon.FileText, { size: 14, style: { color: "var(--text-muted)" } }),
      React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 500 } }, file.path),
      hasFinding && React.createElement("span", { style: { width: 6, height: 6, borderRadius: 99, background: "var(--crit)" }, title: file.finding_lines.length + " finding(s)" }),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } },
        file.pseudocode_summary && React.createElement("span", { title: file.pseudocode_summary, style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--accent-text)", background: "var(--accent-bg)", padding: "2px 7px", borderRadius: 5 } },
          React.createElement(window.Icon.Sparkles, { size: 11 }), "summary"),
        React.createElement("span", { className: "mono tnum", style: { fontSize: 11.5 } },
          React.createElement("span", { style: { color: "var(--code-add-text)" } }, "+" + file.additions), " ",
          React.createElement("span", { style: { color: "var(--code-del-text)" } }, "−" + file.deletions)))),
    open && file.pseudocode_summary && React.createElement("div", { style: { padding: "8px 12px 8px 33px", borderTop: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 7, lineHeight: 1.5 } },
      React.createElement(window.Icon.Sparkles, { size: 13, style: { color: "var(--accent)", flexShrink: 0, marginTop: 2 } }),
      React.createElement("span", null, React.createElement("b", { style: { color: "var(--text-primary)", fontWeight: 600 } }, "What this does: "), file.pseudocode_summary)),
    open && lines && React.createElement("div", { style: { borderTop: "1px solid var(--border)", padding: "6px 0", background: "var(--bg-surface)" } },
      lines.map((ln, i) => React.createElement(CodeLine, { key: i, ln, file: file.path,
        comment: ln.finding ? anchors[ln.finding] === i : false,
        open: ln.finding ? !hidden[ln.finding] : false,
        onToggle: ln.finding ? () => toggle(ln.finding) : undefined }))),
    open && !lines && React.createElement("div", { style: { padding: "14px 16px", fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid var(--border)", textAlign: "center" } }, "Mechanical changes — diff collapsed by default"));
}

function DiffGroup({ group, navTarget, defaultOpen }) {
  const r = ROLE[group.role];
  const [open, setOpen] = React.useState(defaultOpen);
  const [hov, setHov] = React.useState(false);
  // a deep-link into a collapsed group must open it
  React.useEffect(() => {
    if (navTarget && group.files.some((f) => f.path === navTarget.file)) setOpen(true);
  }, [navTarget]);
  const withFindings = group.files.filter((f) => f.finding_lines.length > 0).length;
  return React.createElement("div", { style: { marginBottom: 14 } },
    React.createElement("div", {
      onClick: () => setOpen((o) => !o), onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false),
      style: { display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", marginBottom: open ? 8 : 0, marginLeft: -10, borderRadius: 7, cursor: "pointer", userSelect: "none", background: hov ? "var(--bg-surface)" : "transparent", transition: "background .12s" },
    },
      React.createElement(window.Icon.ChevronRight, { size: 14, style: { color: "var(--text-muted)", flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" } }),
      React.createElement("span", { style: { width: 8, height: 8, borderRadius: 2, background: r.c, flexShrink: 0 } }),
      React.createElement("span", { style: { fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" } }, r.label),
      React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, r.desc),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, flexShrink: 0 } },
        !open && withFindings > 0 && React.createElement("span", { title: withFindings + " file(s) with findings", style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: "var(--crit)" } },
          React.createElement("span", { style: { width: 6, height: 6, borderRadius: 99, background: "var(--crit)" } }), withFindings),
        React.createElement("span", { className: "tnum", style: { fontSize: 11, color: "var(--text-muted)" } }, group.files.length + " files"))),
    open && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
      group.files.map((f, fi) => React.createElement(DiffFileCard, { key: fi, file: f, role: group.role, navTarget }))));
}

function SplitBanner() {
  const sp = window.DIFF.split_suggestion;
  if (!sp.too_big) return null;
  return React.createElement("div", { style: { border: "1px solid var(--warn)", borderRadius: 8, background: "var(--warn-bg)", padding: 14, marginBottom: 14 } },
    React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "flex-start" } },
      React.createElement(window.Icon.AlertTriangle, { size: 18, style: { color: "var(--warn)", flexShrink: 0, marginTop: 1 } }),
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontSize: 13.5, fontWeight: 650 } }, "This PR is " + sp.total_lines + " lines. Consider splitting:"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginTop: 10 } },
          sp.proposed_splits.map((s, i) => React.createElement("label", { key: i, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" } },
            React.createElement("span", { style: { width: 15, height: 15, borderRadius: 4, border: "1.5px solid var(--border-strong)", display: "inline-grid", placeItems: "center" } }),
            React.createElement("b", { style: { color: "var(--text-primary)", fontWeight: 600 } }, s.name), "·",
            React.createElement("span", { className: "mono", style: { fontSize: 11.5 } }, s.files.join(", "))))),
        React.createElement("div", { style: { marginTop: 12 } }, React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "GitBranch" }, "Generate split PRs")))));
}

function SmartDiff({ navTarget }) {
  const D = window.DIFF;
  const [smart, setSmart] = React.useState(true);
  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 14 } },
      React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-secondary)" } }, "9 files · ",
        React.createElement("span", { className: "mono", style: { color: "var(--code-add-text)" } }, "+247"), " ",
        React.createElement("span", { className: "mono", style: { color: "var(--code-del-text)" } }, "−38")),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 2, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, padding: 2 } },
        [["smart", "Smart order"], ["orig", "Original order"]].map(([k, l]) => React.createElement("button", {
          key: k, onClick: () => setSmart(k === "smart"),
          style: { padding: "3px 11px", fontSize: 11.5, fontWeight: 600, borderRadius: 5, border: "none",
            background: (smart === (k === "smart")) ? "var(--bg-elevated)" : "transparent", color: (smart === (k === "smart")) ? "var(--text-primary)" : "var(--text-muted)" },
        }, l)))),
    React.createElement(SplitBanner),
    smart ? D.groups.map((g, gi) => React.createElement(DiffGroup, { key: gi, group: g, navTarget, defaultOpen: g.role !== "boilerplate" }))
      : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
      D.groups.flatMap((g) => g.files).sort((a, b) => a.path.localeCompare(b.path)).map((f, fi) => React.createElement(DiffFileCard, { key: fi, file: f, navTarget }))));
}

Object.assign(window, { SmartDiff, DiffGroup, DiffFileCard, SplitBanner, InlineFindingComment });
