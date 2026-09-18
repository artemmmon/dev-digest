/* screen_conv_conf.jsx — N7 Conventions extractor + N8 Conformance Report */

function ConventionCard({ c }) {
  return React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-elevated)", padding: 16, marginBottom: 12 } },
    React.createElement("div", { style: { display: "flex", gap: 14 } },
      React.createElement("div", { style: { flex: 1, minWidth: 0 } },
        React.createElement("div", { style: { fontSize: 14, fontWeight: 600, fontStyle: "italic", lineHeight: 1.4 } }, c.rule),
        React.createElement("div", { style: { marginTop: 10, borderRadius: 7, border: "1px solid var(--border)", overflow: "hidden" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" } },
            React.createElement(window.MonoLink, null, c.evidence_path),
            React.createElement(window.Icon.Copy, { size: 12, style: { color: "var(--text-muted)", cursor: "pointer" } })),
          React.createElement("pre", { className: "mono", style: { margin: 0, padding: "10px 12px", fontSize: 11.5, lineHeight: 1.55, color: "var(--text-primary)", background: "var(--code-bg)", overflow: "auto" } }, c.evidence_snippet)),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 } },
          React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)" } }, "Confidence"),
          React.createElement("div", { style: { width: 90 } }, React.createElement(window.ProgressBar, { value: c.confidence * 100, height: 5, color: c.confidence >= 0.85 ? "var(--ok)" : "var(--warn)" })),
          React.createElement("span", { className: "mono tnum", style: { fontSize: 11, color: "var(--text-secondary)" } }, Math.round(c.confidence * 100) + "%"))),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 7, flexShrink: 0, width: 150 } },
        React.createElement(window.Button, { kind: "primary", size: "sm", icon: "Sparkles", full: true }, "Accept as Skill"),
        React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Edit", full: true }, "Edit first"),
        React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "X", full: true }, "Reject"))));
}

function ScreenConventions({ h = 760, empty }) {
  if (empty) return React.createElement(window.AppFrame, { active: "conventions", h, crumb: [{ label: "Skills Lab" }, { label: "Conventions" }] },
    React.createElement(window.EmptyState, { icon: "ListChecks", title: "No conventions extracted yet", body: "Scan the repo to surface house-rules — naming, error handling, structure — each backed by evidence you can turn into a Skill.", cta: "Run extraction" }));
  return React.createElement(window.AppFrame, { active: "conventions", h, crumb: [{ label: "Skills Lab" }, { label: "Conventions" }] },
    React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 880, margin: "0 auto" } },
      React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 } },
        React.createElement("div", { style: { flex: 1 } },
          React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } }, "Conventions in ", React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, "payments-api")),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Detected from 84 sample files · last scan 1h ago")),
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "RefreshCw" }, "Re-scan")),
      React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16 } },
        React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "Check" }, "Accept all (3)"),
        React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "X" }, "Reject all")),
      window.CONVENTIONS.map((c) => React.createElement(ConventionCard, { key: c.id, c }))));
}

/* ---- N8 Conformance Report ---- */
const CONFORMANCE = {
  spec: "rate-limiting.prd.md", completeness: 78,
  implemented: [
    { req: "All public endpoints must be rate-limited", ev: "src/middleware/ratelimit.ts:25", note: "Token-bucket limiter applied to /api/public/*" },
    { req: "Limiter backed by Redis for multi-instance", ev: "src/middleware/ratelimit.ts:27", note: "Uses redis.incr per bucket key" },
    { req: "Per-client-IP bucketing", ev: "src/middleware/ratelimit.ts:41", note: "bucketKey() derives from req.ip" },
  ],
  missing: [
    { req: "429 responses must include Retry-After header", where: "Expected in the 429 branch at ratelimit.ts:52 — only status is set" },
    { req: "Buckets reset on a schedule", where: "No cron found; spec calls for hourly reset job" },
  ],
  creep: [
    { code: "Webhook callback_url forwarding", ev: "src/api/public/webhooks.ts:61", note: "Not tied to any rate-limiting requirement — and flagged as SSRF risk" },
  ],
};

function ConfCard({ title, note, ev, where, color }) {
  return React.createElement("div", { style: { border: "1px solid var(--border)", borderLeft: "3px solid " + color, borderRadius: 8, background: "var(--bg-elevated)", padding: 13, marginBottom: 10 } },
    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, lineHeight: 1.4 } }, title),
    (note || where) && React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.45 } }, note || where),
    ev && React.createElement("div", { style: { marginTop: 8 } }, React.createElement(window.MonoLink, null, ev)));
}

function ConfColumn({ icon, label, color, count, items, render }) {
  return React.createElement("div", { style: { flex: 1, minWidth: 0 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, background: color + "1a", marginBottom: 12 } },
      React.createElement(window.Icon[icon], { size: 15, style: { color } }),
      React.createElement("span", { style: { fontSize: 13, fontWeight: 600, color } }, label),
      React.createElement("span", { className: "tnum", style: { marginLeft: "auto", fontSize: 12, fontWeight: 700, color } }, count)),
    items.map(render));
}

function ScreenConformance({ h = 820, empty }) {
  if (empty) return React.createElement(window.AppFrame, { active: "context", h, crumb: [{ label: "Conformance" }] },
    React.createElement(window.EmptyState, { icon: "ListChecks", title: "Add a spec to compare against", body: "Pick a PRD from Project Context and DevDigest checks the PR against each requirement.", cta: "Choose a spec" }));
  const C = CONFORMANCE;
  return React.createElement(window.AppFrame, { active: "context", h, crumb: [{ label: "Conformance" }, { label: "#482", mono: true }] },
    React.createElement("div", { style: { padding: "20px 28px 40px", maxWidth: 1040, margin: "0 auto" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 22 } },
        React.createElement("div", { style: { flex: 1 } },
          React.createElement("h1", { style: { fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" } }, "PRD: Rate Limiting"),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } }, "Comparing PR ", React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, "#482"), " against ", React.createElement("span", { className: "mono" }, C.spec))),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 } },
          React.createElement(window.CircularScore, { score: C.completeness, size: 60, stroke: 6 }),
          React.createElement("span", { style: { fontSize: 10.5, color: "var(--text-muted)", letterSpacing: "0.04em" } }, "COMPLETE")),
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "RefreshCw" }, "Re-run check")),
      React.createElement("div", { style: { display: "flex", gap: 18 } },
        React.createElement(ConfColumn, { icon: "CheckCircle", label: "Implemented", color: "#10b981", count: C.implemented.length, items: C.implemented,
          render: (it, i) => React.createElement(ConfCard, { key: i, title: it.req, note: it.note, ev: it.ev, color: "#10b981" }) }),
        React.createElement(ConfColumn, { icon: "AlertTriangle", label: "Missing", color: "#f59e0b", count: C.missing.length, items: C.missing,
          render: (it, i) => React.createElement(ConfCard, { key: i, title: it.req, where: it.where, color: "#f59e0b" }) }),
        React.createElement(ConfColumn, { icon: "Plus", label: "Scope creep", color: "#999999", count: C.creep.length, items: C.creep,
          render: (it, i) => React.createElement(ConfCard, { key: i, title: it.code, note: it.note, ev: it.ev, color: "#999999" }) }))));
}

Object.assign(window, { ScreenConventions, ScreenConformance });
