/* screen_tour_context.jsx — N5 Onboarding Tour + N6 Project Context */

const TOUR = [
  { kind: "architecture_overview", title: "Architecture overview", icon: "Boxes",
    body: "**payments-api** is a Node + TypeScript service fronting Stripe. Requests enter through `src/server.ts`, pass middleware (auth, rate-limit), and route to `src/api/*`. Persistence is Postgres via a thin `db` client; Redis backs sessions and the new rate-limit buckets.", diagram: true },
  { kind: "critical_paths", title: "Critical paths", icon: "Activity",
    files: [{ p: "src/server.ts", d: "App bootstrap + middleware chain" }, { p: "src/api/public/index.ts", d: "Public router — unauthenticated surface" }, { p: "src/middleware/auth.ts", d: "Token validation, used by 14 routes" }, { p: "src/lib/redis.ts", d: "Shared Redis singleton — reuse this" }] },
  { kind: "how_to_run", title: "How to run locally", icon: "Command",
    steps: ["pnpm install", "cp .env.example .env  # add OPENAI + STRIPE keys", "docker compose up -d postgres redis", "pnpm dev  # http://localhost:3000"] },
  { kind: "guided_reading", title: "Guided reading path", icon: "ListChecks",
    reading: [{ p: "src/server.ts", why: "See the whole request lifecycle in one file" }, { p: "src/api/public/index.ts", why: "Understand the public contract before touching it" }, { p: "src/middleware/auth.ts", why: "Auth touches almost everything downstream" }] },
  { kind: "first_tasks", title: "First tasks", icon: "Target",
    tasks: [{ t: "Add a /health readiness probe", scope: "src/api/public/health.ts", cx: "Low" }, { t: "Backfill tests for the rate limiter", scope: "test/ratelimit.test.ts", cx: "Medium" }, { t: "Document the webhook signature flow", scope: "specs/", cx: "Low" }] },
];

function TourMermaid() {
  // simple hand-laid architecture diagram (boxes + arrows)
  const box = (x, y, w, label, c) => React.createElement("g", { key: label, transform: `translate(${x},${y})` },
    React.createElement("rect", { width: w, height: 34, rx: 7, fill: "var(--bg-surface)", stroke: c || "var(--border-strong)", strokeWidth: 1.25 }),
    React.createElement("text", { x: w / 2, y: 21, textAnchor: "middle", fontSize: 12, fontFamily: "JetBrains Mono, monospace", fill: "var(--text-primary)" }, label));
  const arrow = (x1, y1, x2, y2) => React.createElement("line", { key: x1 + "-" + x2 + y1, x1, y1, x2, y2, stroke: "var(--text-muted)", strokeWidth: 1.25, markerEnd: "url(#ah)" });
  return React.createElement("svg", { width: "100%", height: 180, viewBox: "0 0 560 180", style: { background: "var(--bg-primary)", borderRadius: 8, border: "1px solid var(--border)" } },
    React.createElement("defs", null, React.createElement("marker", { id: "ah", markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: "auto" }, React.createElement("path", { d: "M0,0 L6,3 L0,6", fill: "none", stroke: "var(--text-muted)", strokeWidth: 1.25 }))),
    box(20, 74, 90, "client", "var(--text-muted)"), arrow(112, 91, 158, 91),
    box(160, 74, 110, "server.ts", "var(--accent)"), arrow(272, 91, 318, 91),
    box(320, 30, 130, "middleware", "var(--warn)"), box(320, 120, 130, "api/public/*", "var(--accent)"),
    arrow(385, 64, 385, 116),
    box(470, 30, 70, "redis", "var(--ok)"), box(470, 120, 70, "postgres", "var(--ok)"),
    arrow(452, 47, 468, 47), arrow(452, 137, 468, 137));
}

function TourSection({ s }) {
  const [open, setOpen] = React.useState(true);
  return React.createElement("div", { id: s.kind, style: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", marginBottom: 14, overflow: "hidden", scrollMarginTop: 16 } },
    React.createElement("div", { onClick: () => setOpen((o) => !o), style: { display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", cursor: "pointer" } },
      React.createElement("div", { style: { width: 28, height: 28, borderRadius: 7, background: "var(--accent-bg)", color: "var(--accent)", display: "grid", placeItems: "center" } }, React.createElement(window.Icon[s.icon], { size: 15 })),
      React.createElement("h3", { style: { fontSize: 14.5, fontWeight: 600, flex: 1 } }, s.title),
      React.createElement(window.Icon.ChevronDown, { size: 16, style: { color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" } })),
    open && React.createElement("div", { style: { padding: "0 16px 16px" } },
      s.body && React.createElement("p", { style: { fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)", textWrap: "pretty" } }, window.mdLite(s.body)),
      s.diagram && React.createElement("div", { style: { marginTop: 12 } }, React.createElement(TourMermaid)),
      s.files && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 7, marginTop: 4 } }, s.files.map((f, i) =>
        React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 7, background: "var(--bg-surface)" } },
          React.createElement(window.Icon.FileText, { size: 13, style: { color: "var(--text-muted)" } }),
          React.createElement(window.MonoLink, null, f.p), React.createElement("span", { style: { fontSize: 12, color: "var(--text-secondary)", flex: 1 } }, "— " + f.d),
          React.createElement(window.Button, { kind: "ghost", size: "sm" }, "Open")))),
      s.steps && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 4 } }, s.steps.map((st, i) =>
        React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 7, background: "var(--code-bg)", border: "1px solid var(--border)" } },
          React.createElement("span", { className: "tnum", style: { fontSize: 11, color: "var(--text-muted)", width: 14 } }, i + 1),
          React.createElement("code", { className: "mono", style: { fontSize: 12, color: "var(--text-primary)", flex: 1 } }, st),
          React.createElement(window.Icon.Copy, { size: 13, style: { color: "var(--text-muted)", cursor: "pointer" } })))),
      s.reading && React.createElement("ol", { style: { margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, marginTop: 4 } }, s.reading.map((r, i) =>
        React.createElement("li", { key: i, style: { display: "flex", gap: 11, alignItems: "flex-start" } },
          React.createElement("span", { className: "tnum", style: { width: 20, height: 20, borderRadius: 99, background: "var(--accent-bg)", color: "var(--accent)", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 } }, i + 1),
          React.createElement("div", null, React.createElement(window.MonoLink, null, r.p), React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 } }, r.why))))),
      s.tasks && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 4 } }, s.tasks.map((t, i) =>
        React.createElement("div", { key: i, style: { padding: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)" } },
          React.createElement("div", { style: { fontSize: 13, fontWeight: 600, lineHeight: 1.35 } }, t.t),
          React.createElement("div", { className: "mono", style: { fontSize: 11, color: "var(--text-muted)", margin: "7px 0" } }, t.scope),
          React.createElement(window.Badge, { color: t.cx === "Low" ? "var(--ok)" : "var(--warn)", bg: "transparent", style: { border: "1px solid var(--border-strong)" } }, t.cx + " complexity"))))));
}

function useScroller(ref) {
  return React.useCallback(() => {
    let el = ref.current ? ref.current.parentElement : null;
    while (el) {
      const s = getComputedStyle(el).overflowY;
      if ((s === "auto" || s === "scroll") && el.scrollHeight > el.clientHeight + 4) return el;
      el = el.parentElement;
    }
    return null;
  }, [ref]);
}

function ScreenTour({ h = 1200, empty }) {
  const wrapRef = React.useRef(null);
  const getScroller = useScroller(wrapRef);
  const [act, setAct] = React.useState(TOUR[0].kind);

  const topOf = (el, sc) => el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  const jump = (kind) => {
    const el = document.getElementById(kind);
    const sc = getScroller();
    setAct(kind);
    if (!el) return;
    if (sc) sc.scrollTo({ top: Math.max(0, topOf(el, sc) - 14), behavior: "smooth" });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 14, behavior: "smooth" });
  };
  React.useEffect(() => {
    if (empty) return;
    const sc = getScroller();
    if (!sc) return;
    const onScroll = () => {
      let cur = TOUR[0].kind;
      TOUR.forEach((s) => {
        const el = document.getElementById(s.kind);
        if (el && topOf(el, sc) - sc.scrollTop <= 90) cur = s.kind;
      });
      setAct(cur);
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => sc.removeEventListener("scroll", onScroll);
  }, [empty, getScroller]);

  if (empty) return React.createElement(window.AppFrame, { active: "onboarding-tour", h, crumb: [{ label: "acme/payments-api", mono: true }, { label: "Onboarding Tour" }] },
    React.createElement(window.EmptyState, { icon: "Boxes", title: "Generate onboarding tour", body: "DevDigest indexes the repo and writes a guided tour: architecture, critical paths, how to run, a reading order, and first tasks. Takes 30–60s and ~5,000 tokens.", cta: "Generate onboarding tour" }));
  return React.createElement(window.AppFrame, { active: "onboarding-tour", h, crumb: [{ label: "acme/payments-api", mono: true }, { label: "Onboarding Tour" }] },
    React.createElement("div", { ref: wrapRef, style: { display: "flex", gap: 28, padding: "24px 28px 40px", maxWidth: 1080, margin: "0 auto" } },
      React.createElement("div", { style: { width: 180, flexShrink: 0 } },
        React.createElement("div", { style: { position: "sticky", top: 16 } },
          React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 10 } }, "On this page"),
          TOUR.map((s) => {
            const on = act === s.kind;
            return React.createElement("div", { key: s.kind, onClick: () => jump(s.kind),
              style: { display: "block", fontSize: 12.5, cursor: "pointer", color: on ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: on ? 600 : 500, padding: "5px 0", borderLeft: "2px solid " + (on ? "var(--accent)" : "transparent"), paddingLeft: 11, marginLeft: -2, transition: "color .12s" } }, s.title);
          }))),
      React.createElement("div", { style: { flex: 1, minWidth: 0 } },
        React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 } },
          React.createElement("div", { style: { flex: 1 } },
            React.createElement("h1", { style: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } }, "Onboarding for ", React.createElement("span", { className: "mono", style: { color: "var(--accent-text)" } }, "payments-api")),
            React.createElement("p", { style: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 } }, "Generated from index of 12,450 files · last refreshed 2h ago")),
          React.createElement(window.Button, { kind: "ghost", size: "sm", icon: "RefreshCw" }, "Regenerate"),
          React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Link" }, "Share link")),
        TOUR.map((s, i) => React.createElement(TourSection, { key: i, s })))));
}

/* ---- N6 Project Context ---- */
const SPEC_BODIES = {
  "public-api.md": `# Public API — PRD

## Goals
The public API namespace (\`/api/public/*\`) exposes read endpoints for
third-party integrators without authentication, plus a webhook receiver.

## Requirements
- All public endpoints MUST be rate-limited per client IP.
- Rate-limited responses MUST return 429 with a \`Retry-After\` header.
- Webhook receiver MUST verify the \`stripe-signature\` header.
- No endpoint may expose internal account IDs.

## Non-goals
- Authentication for public endpoints (out of scope).
- GraphQL surface (deferred to Q3).`,
  "security-baseline.md": `# Security baseline

## Secrets
- No secret literals in source. Everything comes from \`process.env\`.
- A committed key is a **release blocker**, not a warning.

## Untrusted input
- Any user-supplied URL that drives an outbound request is SSRF-suspect.
- Validate against the integrator's registered host allowlist.

## Logging
- Never log tokens, signatures, or raw webhook bodies.
- Redact \`authorization\` before structured logging.`,
  "onboarding-flow.md": `# Onboarding flow

## First run
A new user brings their own model key, connects a GitHub token, and picks
one repository. Nothing is uploaded to our servers.

## Steps
- Model provider key — verified with a cheap reachability call.
- GitHub PAT — scoped to \`repo\` read + PR comment write.
- Repository — indexed in the background; the tour is generated after.

## Acceptance
- A user reaches their first review in under five minutes.`,
  "rate-limiting.prd.md": `# PRD: Rate limiting

## Problem
Public endpoints are unmetered; one integrator can exhaust the pool.

## Requirements
- Token bucket per client IP, backed by Redis.
- Buckets reset on a schedule — hourly job, not on read.
- 429 responses MUST include \`Retry-After\`.
- Limits are configurable per endpoint without a deploy.

## Out of scope
- Per-account quotas (needs auth, tracked separately).`,
  "webhooks.md": `# Webhooks

## Receiving
Stripe posts to \`/api/public/webhooks\`. The raw body parser is intentional —
signature verification needs the unparsed payload.

## Forwarding
- \`callback_url\` is integrator-supplied and MUST be allowlisted.
- Forwarded requests carry no account credentials.

## Retries
- Exponential backoff, five attempts, then dead-letter.`,
  "data-retention.md": `# Data retention

## What we keep
- Review findings and run traces: 90 days.
- Diff snapshots used in eval cases: until the case is deleted.
- Model keys: local machine only, never our storage.

## Deletion
- Deleting a repository purges its runs, traces, and learnings.
- Export before delete — deletion is not recoverable.`,
};
const SPEC_TREE = ["public-api.md", "security-baseline.md", "onboarding-flow.md", "rate-limiting.prd.md", "webhooks.md", "data-retention.md"];

function MdBody({ src }) {
  return React.createElement("div", { style: { maxWidth: 680 } },
    src.split("\n").map((l, i) => {
      if (l.startsWith("# ")) return React.createElement("h1", { key: i, style: { fontSize: 22, fontWeight: 700, margin: "0 0 14px" } }, l.slice(2));
      if (l.startsWith("## ")) return React.createElement("h2", { key: i, style: { fontSize: 15, fontWeight: 600, margin: "18px 0 8px", color: "var(--text-primary)" } }, l.slice(3));
      if (l.startsWith("- ")) return React.createElement("div", { key: i, style: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6, paddingLeft: 16, display: "flex", gap: 8 } }, React.createElement("span", { style: { color: "var(--text-muted)" } }, "•"), React.createElement("span", null, window.mdLite(l.slice(2))));
      if (!l.trim()) return React.createElement("div", { key: i, style: { height: 8 } });
      return React.createElement("p", { key: i, style: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 4px" } }, window.mdLite(l));
    }));
}

function ScreenContext({ h = 760, empty }) {
  const [bodies, setBodies] = React.useState(SPEC_BODIES);
  const [files, setFiles] = React.useState(SPEC_TREE);
  const [sel, setSel] = React.useState(SPEC_TREE[0]);
  const [mode, setMode] = React.useState("Preview");
  const [indexed, setIndexed] = React.useState("5m ago");

  const addFile = (name, body, editing) => {
    let n = name, i = 2;
    while (files.includes(n)) { n = name.replace(/\.md$/, "") + "-" + i + ".md"; i++; }
    setFiles((f) => f.concat([n]));
    setBodies((b) => ({ ...b, [n]: body }));
    setSel(n);
    setMode(editing ? "Edit" : "Preview");
  };

  if (empty) return React.createElement(window.AppFrame, { active: "context", h, crumb: [{ label: "acme/payments-api", mono: true }, { label: "Project Context" }] },
    React.createElement(window.EmptyState, { icon: "Folder", title: "No spec files yet", body: "Drop your PRDs, tech specs, and acceptance criteria here. Every agent reads them as grounding context.", cta: "Add a spec file" }));
  return React.createElement(window.AppFrame, { active: "context", h, crumb: [{ label: "acme/payments-api", mono: true }, { label: "Project Context" }, { label: sel, mono: true }] },
    React.createElement("div", { style: { display: "flex", height: h - 52 } },
      React.createElement("div", { style: { width: 240, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-surface)" } },
        React.createElement("div", { style: { padding: "14px 14px 10px" } },
          React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em", marginBottom: 4 } }, "PROJECT CONTEXT"),
          React.createElement("div", { className: "mono", style: { fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 12 } }, ".devdigest/specs/"),
          React.createElement("div", { style: { display: "flex", gap: 4 } },
            React.createElement(window.IconBtn, { icon: "Plus", label: "New file", onClick: () => addFile("untitled.md", "# Untitled spec\n\n## Goals\n- ", true) }),
            React.createElement(window.IconBtn, { icon: "Folder", label: "New folder", onClick: () => addFile("new-folder/spec.md", "# New folder spec\n", true) }),
            React.createElement(window.IconBtn, { icon: "Upload", label: "Upload", onClick: () => addFile("uploaded-spec.md", "# Uploaded spec\n\nPasted from your machine — edit and re-index.\n", false) }),
            React.createElement(window.IconBtn, { icon: "RefreshCw", label: "Re-index", onClick: () => setIndexed("just now") }))),
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "0 8px" } },
          files.map((name) => {
            const on = name === sel;
            return React.createElement("div", { key: name, onClick: () => { setSel(name); setMode("Preview"); },
              style: { display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, background: on ? "var(--bg-hover)" : "transparent", color: on ? "var(--text-primary)" : "var(--text-secondary)" } },
              React.createElement(window.Icon.FileText, { size: 13, style: { color: on ? "var(--accent)" : "var(--text-muted)" } }),
              React.createElement("span", { className: "mono", style: { fontSize: 12 } }, name));
          })),
        React.createElement("div", { style: { padding: "11px 14px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, React.createElement("span", { style: { width: 6, height: 6, borderRadius: 99, background: "var(--ok)" } }), "Indexed: " + files.length + " files · 1,240 chunks"), "last " + indexed)),
      React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: "1px solid var(--border)" } },
          React.createElement("span", { className: "mono", style: { fontSize: 13, fontWeight: 600 } }, sel),
          React.createElement("div", { style: { display: "flex", gap: 2, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, padding: 2, marginLeft: 4 } },
            ["Preview", "Edit"].map((m) => React.createElement("button", { key: m, onClick: () => setMode(m),
              style: { padding: "3px 10px", fontSize: 11.5, fontWeight: 600, borderRadius: 5, border: "none", cursor: "pointer", font: "inherit", background: mode === m ? "var(--bg-elevated)" : "transparent", color: mode === m ? "var(--text-primary)" : "var(--text-muted)" } }, m))),
          React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } },
            React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)" } }, React.createElement(window.Icon.Cpu, { size: 13 }), "Used by 3 agents"),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } }, React.createElement(window.CircularScore, { score: 78, size: 34, stroke: 3.5 }), React.createElement("span", { style: { fontSize: 9, color: "var(--text-muted)" } }, "COVERAGE")))),
        React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "20px 28px" } },
          mode === "Preview"
            ? React.createElement(MdBody, { src: bodies[sel] || "" })
            : React.createElement("textarea", {
                value: bodies[sel] || "", onChange: (e) => setBodies((b) => ({ ...b, [sel]: e.target.value })), spellCheck: false,
                className: "mono",
                style: { width: "100%", maxWidth: 680, minHeight: Math.max(280, h - 190), padding: "14px 16px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--code-bg)", color: "var(--text-primary)", fontSize: 12.5, lineHeight: 1.65, resize: "vertical", outline: "none" } })))));
}

Object.assign(window, { ScreenTour, ScreenContext });
