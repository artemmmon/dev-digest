/* screen_skills.jsx — Skills Lab (list + editor + eval panel) and Eval Dashboard */

function MiniBar({ value, color }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
    React.createElement("div", { style: { flex: 1, height: 6, background: "var(--bg-hover)", borderRadius: 3, overflow: "hidden" } },
      React.createElement("div", { style: { width: (value * 100) + "%", height: "100%", background: color, borderRadius: 3 } })),
    React.createElement("span", { className: "mono tnum", style: { fontSize: 11, color: "var(--text-secondary)", width: 30, textAlign: "right" } }, Math.round(value * 100) + "%"));
}

const SKILL_TYPE = {
  rubric: { c: "#3b82f6", label: "rubric" }, convention: { c: "#10b981", label: "convention" },
  security: { c: "#ef4444", label: "security" }, custom: { c: "#999999", label: "custom" },
};
const SKILL_SOURCE = {
  manual: { icon: "Edit", label: "Manual" }, extracted: { icon: "Wrench", label: "Extracted" },
  community: { icon: "Globe", label: "Community" }, imported_url: { icon: "Link", label: "Imported" },
};

function SkillListItem({ s, active, onClick }) {
  const t = SKILL_TYPE[s.type], src = SKILL_SOURCE[s.source];
  const [en, setEn] = React.useState(s.enabled);
  return React.createElement("div", {
    onClick, style: { padding: "10px 12px", borderRadius: 7, cursor: "pointer", border: "1px solid " + (active ? "var(--border-strong)" : "transparent"),
      background: active ? "var(--bg-hover)" : "transparent", opacity: en ? 1 : 0.55, marginBottom: 2 },
  },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, s.name),
      React.createElement("div", { onClick: (e) => { e.stopPropagation(); setEn(!en); } }, React.createElement(window.Toggle, { on: en, onChange: setEn, size: 13 }))),
    React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, s.description),
    React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 7, alignItems: "center" } },
      React.createElement("span", { style: { fontSize: 10.5, fontWeight: 600, color: t.c, background: t.c + "1a", padding: "1px 6px", borderRadius: 4 } }, t.label),
      React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "var(--text-muted)" } },
        React.createElement(window.Icon[src.icon], { size: 11 }), src.label)));
}

function CodeEditor({ code }) {
  const lines = code.split("\n");
  return React.createElement("div", { style: { flex: 1, overflow: "hidden", background: "var(--bg-surface)", display: "flex", flexDirection: "column" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid var(--border)" } },
      React.createElement(window.Icon.FileText, { size: 14, style: { color: "var(--text-muted)" } }),
      React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600 } }, "pr-quality-rubric.md"),
      React.createElement(window.Badge, { color: "var(--text-muted)" }, "unsaved"),
      React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 6 } },
        React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Eye" }, "Preview"),
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Check" }, "Save"))),
    React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "10px 0" } },
      lines.map((ln, i) => React.createElement("div", { key: i, style: { display: "flex", fontSize: 12.5, lineHeight: "21px" } },
        React.createElement("span", { className: "mono tnum", style: { width: 40, textAlign: "right", paddingRight: 14, color: "var(--text-muted)", userSelect: "none", flexShrink: 0 } }, i + 1),
        React.createElement("span", { className: "mono", style: { whiteSpace: "pre-wrap", color: ln.startsWith("#") ? "var(--accent-text)" : ln.startsWith("-") ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: ln.startsWith("#") ? 600 : 400 } }, ln || " ")))));
}

function EvalPanel() {
  const E = window.EVAL;
  return React.createElement("div", { style: { width: 320, flexShrink: 0, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-primary)" } },
    React.createElement("div", { style: { padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 } },
      React.createElement(window.Icon.Gauge, { size: 15, style: { color: "var(--accent)" } }),
      React.createElement("span", { style: { fontSize: 13, fontWeight: 600 } }, "Eval"),
      React.createElement("div", { style: { marginLeft: "auto" } }, React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Play" }, "Run on 20"))),
    React.createElement("div", { style: { padding: 14, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 } },
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        [["Recall", E.current.recall, E.delta.recall, "var(--accent)"], ["Precision", E.current.precision, E.delta.precision, "var(--ok)"], ["Citation", E.current.citation, E.delta.citation, "var(--warn)"]].map(([l, v, d, c]) =>
          React.createElement("div", { key: l, style: { flex: 1, padding: "9px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text-muted)", fontWeight: 600 } }, l),
            React.createElement("div", { className: "tnum", style: { fontSize: 19, fontWeight: 700, marginTop: 2 } }, Math.round(v * 100)),
            React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: d > 0 ? "var(--ok)" : "var(--crit)" } }, (d > 0 ? "+" : "") + Math.round(d * 100))))),
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-secondary)" } },
        React.createElement("span", null, React.createElement("b", { className: "tnum", style: { color: "var(--text-primary)" } }, E.current.traces_passed + "/" + E.current.traces_total), " traces passed"),
        React.createElement("span", { className: "mono tnum" }, "$" + E.current.cost.toFixed(2))),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
        E.traces.map((t) => React.createElement("div", { key: t.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 5, background: "var(--bg-elevated)", fontSize: 11.5 } },
          React.createElement(window.Icon[t.pass ? "CheckCircle" : "XCircle"], { size: 13, style: { color: t.pass ? "var(--ok)" : "var(--crit)", flexShrink: 0 } }),
          React.createElement("span", { className: "mono", style: { flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, t.name),
          React.createElement("span", { style: { fontSize: 10, color: "var(--text-muted)" } }, t.pass ? "match" : "miss")))),
      React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Workflow", full: true }, "Export to CI workflow")));
}

function SkillSearchPanel({ onClose }) {
  return React.createElement(window.Drawer, { width: 480, title: "Search community skills", subtitle: "Import vetted skills from public repos", onClose },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", marginBottom: 12 } },
      React.createElement(window.Icon.Search, { size: 15, style: { color: "var(--text-muted)" } }),
      React.createElement("span", { style: { flex: 1, fontSize: 13, color: "var(--text-primary)" } }, "security review"),
      React.createElement(window.Icon.X, { size: 14, style: { color: "var(--text-muted)", cursor: "pointer" } })),
    React.createElement("div", { style: { display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" } },
      React.createElement(window.Chip, { active: true }, "All languages"),
      React.createElement(window.Chip, null, "TypeScript"),
      React.createElement(window.Chip, { icon: "Tag" }, "security"),
      React.createElement(window.Chip, { icon: "Tag" }, "performance")),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
      window.COMMUNITY_SKILLS.map((c, i) => React.createElement("div", { key: i, style: { border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-elevated)", padding: 14 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { className: "mono", style: { fontSize: 13, fontWeight: 600, flex: 1 } }, c.name),
          React.createElement("span", { className: "tnum", style: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, color: "var(--warn)" } }, React.createElement(window.Icon.Star, { size: 12 }), c.stars.toLocaleString())),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 10px", lineHeight: 1.45 } }, c.desc),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--text-muted)" } }, c.repo),
          React.createElement(window.Badge, { color: "var(--text-muted)" }, c.lang),
          React.createElement("div", { style: { marginLeft: "auto" } }, React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Plus" }, "Import")))))));
}

function ScreenSkillsLab({ h = 760, searchOpen }) {
  const [sel, setSel] = React.useState("s1");
  const [drawer, setDrawer] = React.useState(!!searchOpen);
  return React.createElement(window.AppFrame, { active: "skills", h, crumb: [{ label: "Skills Lab" }, { label: "Skills" }] },
    drawer && React.createElement(SkillSearchPanel, { onClose: () => setDrawer(false) }),
    React.createElement("div", { style: { display: "flex", height: h - 52 } },
      // left: skill list
      React.createElement("div", { style: { width: 290, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-surface)" } },
        React.createElement("div", { style: { padding: "14px 14px 10px" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } },
            React.createElement("h1", { style: { fontSize: 16, fontWeight: 700, flex: 1 } }, "Skills"),
            React.createElement(window.Dropdown, { width: 220, align: "right",
              trigger: React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Plus", iconRight: "ChevronDown" }, "Add Skill"),
              items: [
                { label: "Import from file", icon: "Upload" },
                { label: "Import from URL", icon: "Link" },
                { label: "Search community skills…", icon: "Globe", onClick: () => setDrawer(true) },
                { divider: true },
                { label: "Create from scratch", icon: "Edit" },
              ] })),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-muted)", fontSize: 12 } },
            React.createElement(window.Icon.Search, { size: 13 }), "Search skills…")),
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "0 8px 8px" } },
          window.SKILLS.map((s) => React.createElement(SkillListItem, { key: s.id, s, active: sel === s.id, onClick: () => setSel(s.id) })))),
      // center: editor
      React.createElement(CodeEditor, { code: window.SKILL_BODY }),
      // right: eval
      React.createElement(EvalPanel)));
}

/* ---- Eval Dashboard ---- */
function ScreenEval({ h = 880 }) {
  const E = window.EVAL;
  return React.createElement(window.AppFrame, { active: "eval", h, crumb: [{ label: "Skills Lab" }, { label: "Eval Dashboard" }] },
    React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 980, margin: "0 auto" } },
      React.createElement("div", { style: { display: "flex", alignItems: "flex-end", marginBottom: 18 } },
        React.createElement("div", null,
          React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } }, "Eval Dashboard"),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Reviewer skill ", React.createElement("span", { className: "mono" }, "pr-quality-rubric"), " · 20-trace gold set · last 8 runs")),
        React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" } },
          React.createElement(window.MonoLink, null, "Configure eval cases →"),
          React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Calendar" }, "30 days"),
          React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Play" }, "Run eval"))),
      // regression alert
      React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center", padding: "11px 14px", borderRadius: 8, border: "1px solid var(--warn)", background: "var(--warn-bg)", marginBottom: 18 } },
        React.createElement(window.Icon.AlertTriangle, { size: 16, style: { color: "var(--warn)" } }),
        React.createElement("span", { style: { fontSize: 13, color: "var(--text-secondary)" } }, React.createElement("b", { style: { color: "var(--text-primary)" } }, "Precision dipped 2pts"), " on v7 — one new false positive on ", React.createElement("span", { className: "mono", style: { fontSize: 12 } }, "unused-import"), ". Recall and citation both up.")),
      // metric cards
      React.createElement("div", { style: { display: "flex", gap: 14, marginBottom: 20 } },
        React.createElement(window.MetricCard, { label: "RECALL", value: Math.round(E.current.recall * 100), suffix: "%", delta: E.delta.recall, color: "var(--accent)", trend: E.trend.recall }),
        React.createElement(window.MetricCard, { label: "PRECISION", value: Math.round(E.current.precision * 100), suffix: "%", delta: E.delta.precision, color: "var(--ok)", trend: E.trend.precision }),
        React.createElement(window.MetricCard, { label: "CITATION ACCURACY", value: Math.round(E.current.citation * 100), suffix: "%", delta: E.delta.citation, color: "var(--warn)", trend: E.trend.citation })),
      // trend chart
      React.createElement(window.Card, { style: { marginBottom: 20 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 12 } },
          React.createElement(window.SectionLabel, { icon: "TrendingUp" }, "Metric trend"),
          React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 14, fontSize: 11.5 } },
            [["Recall", "var(--accent)"], ["Precision", "var(--ok)"], ["Citation", "var(--warn)"]].map(([l, c]) =>
              React.createElement("span", { key: l, style: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-secondary)" } },
                React.createElement("span", { style: { width: 10, height: 2, background: c, borderRadius: 2 } }), l)))),
        React.createElement(window.LineChart, { series: [
          { data: E.trend.recall, color: "var(--accent)" }, { data: E.trend.precision, color: "var(--ok)" }, { data: E.trend.citation, color: "var(--warn)" }], w: 900, h: 200 })),
      // runs table
      React.createElement(window.SectionLabel, { icon: "History" }, "Recent runs"),
      React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" } },
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "150px 70px 1fr 1fr 1fr 90px 80px", gap: 12, padding: "9px 16px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase" } },
          ["Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Cost"].map((c, i) => React.createElement("div", { key: i }, c))),
        E.runs.map((r, i) => React.createElement("div", { key: r.id, style: { display: "grid", gridTemplateColumns: "150px 70px 1fr 1fr 1fr 90px 80px", gap: 12, padding: "10px 16px", borderBottom: i < E.runs.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center", fontSize: 12.5 } },
          React.createElement("span", { className: "mono", style: { color: "var(--text-secondary)", fontSize: 11.5 } }, r.ran_at),
          React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, r.version),
          React.createElement(MiniBar, { value: r.recall, color: "var(--accent)" }),
          React.createElement(MiniBar, { value: r.precision, color: "var(--ok)" }),
          React.createElement(MiniBar, { value: r.citation, color: "var(--warn)" }),
          React.createElement("span", { className: "tnum", style: { fontWeight: 600 } }, r.passed + "/" + r.total),
          React.createElement("span", { className: "mono tnum", style: { color: "var(--text-secondary)" } }, "$" + r.cost.toFixed(2))))))); 
}

Object.assign(window, { ScreenSkillsLab, ScreenEval });
