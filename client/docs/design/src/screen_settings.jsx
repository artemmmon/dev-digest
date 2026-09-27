/* screen_settings.jsx — N9 Settings (focus: Automatic Reviews + Integrations) */

const SETTINGS_NAV = ["API Keys", "GitHub Integration", "Workspace", "Automatic Reviews", "Integrations", "About"];

function SettingsAutoReviews() {
  return React.createElement("div", { style: { maxWidth: 640 } },
    React.createElement("h2", { style: { fontSize: 18, fontWeight: 700, marginBottom: 4 } }, "Automatic Reviews"),
    React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 } }, "Poll GitHub for new PRs and run agents without manual triggering."),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)", marginBottom: 18 } },
      React.createElement(window.Toggle, { on: true, onChange: () => {}, size: 18 }),
      React.createElement("div", null, React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600 } }, "Auto-run review on new PR detection"),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)" } }, "Currently active across this workspace"))),
    React.createElement(window.FormField, { label: "Polling interval" }, React.createElement(window.SelectInput, { value: "Every 5 minutes" })),
    React.createElement(window.FormField, { label: "Agents to run" },
      React.createElement("div", { style: { display: "flex", gap: 7, flexWrap: "wrap" } },
        React.createElement(window.Chip, { active: true, icon: "Check" }, "Security Reviewer"),
        React.createElement(window.Chip, { active: true, icon: "Check" }, "Performance Reviewer"),
        React.createElement(window.Chip, { icon: "Plus" }, "Custom Mentor"))),
    React.createElement(window.FormField, { label: "Trigger conditions" },
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
        [["On new PR", true], ["On new commits to existing PR", true]].map(([l, on], i) =>
          React.createElement("label", { key: i, style: { display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--text-secondary)" } },
            React.createElement("span", { style: { width: 16, height: 16, borderRadius: 4, border: "1.5px solid " + (on ? "var(--accent)" : "var(--border-strong)"), background: on ? "var(--accent)" : "transparent", display: "grid", placeItems: "center" } }, on && React.createElement(window.Icon.Check, { size: 11, style: { color: "#fff" } })), l)))),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 8, background: "var(--ok-bg)", border: "1px solid rgba(16,185,129,0.25)", marginBottom: 18, fontSize: 12.5, color: "var(--text-secondary)" } },
      React.createElement("span", { style: { width: 7, height: 7, borderRadius: 99, background: "var(--ok)", animation: "ddpulse 2s infinite" } }),
      React.createElement("span", null, React.createElement("b", { style: { color: "var(--text-primary)" } }, "Active"), " · last poll 2m ago · 7 PRs tracked")),
    React.createElement("div", { style: { display: "flex", gap: 9, padding: "11px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 } },
      React.createElement(window.Icon.Info, { size: 15, style: { flexShrink: 0, marginTop: 1 } }),
      React.createElement("span", null, "Polling is the default. For instant triggers and CI execution, install the GitHub Action under ", React.createElement("b", { style: { color: "var(--text-secondary)" } }, "Integrations"), ".")));
}

function IntegrationCard({ icon, title, status, statusColor, desc, children }) {
  return React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", padding: 18, marginBottom: 14 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 11, marginBottom: 10 } },
      React.createElement("div", { style: { width: 34, height: 34, borderRadius: 8, background: "var(--bg-surface)", display: "grid", placeItems: "center", color: "var(--text-secondary)" } }, React.createElement(window.Icon[icon], { size: 18 })),
      React.createElement("div", { style: { flex: 1 } }, React.createElement("div", { style: { fontSize: 14, fontWeight: 600 } }, title),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } }, desc)),
      status && React.createElement(window.Badge, { color: statusColor, bg: "transparent", dot: true }, status)),
    children);
}

function SettingsIntegrations() {
  return React.createElement("div", { style: { maxWidth: 660 } },
    React.createElement("h2", { style: { fontSize: 18, fontWeight: 700, marginBottom: 4 } }, "Integrations"),
    React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 } }, "Connect CI and share your configuration as portable plugins."),
    React.createElement(IntegrationCard, { icon: "Workflow", title: "GitHub Action", status: "2 repos", statusColor: "var(--ok)", desc: "Run agents inside CI on every PR" },
      React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12 } }, React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Plus" }, "Install in a repo")),
      [["acme/payments-api", "succeeded 4m ago"], ["acme/billing-worker", "succeeded 1h ago"]].map((r, i) =>
        React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderRadius: 6, background: "var(--bg-surface)", marginTop: 6, fontSize: 12.5 } },
          React.createElement(window.Icon.GitBranch, { size: 13, style: { color: "var(--text-muted)" } }),
          React.createElement("span", { className: "mono", style: { flex: 1, fontWeight: 600 } }, r[0]),
          React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, r[1]),
          React.createElement(window.MonoLink, null, "Manage")))),
    React.createElement(IntegrationCard, { icon: "Upload", title: "Plugin Export", desc: "Skills, agents, learnings, and eval cases as a portable package" },
      React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Boxes" }, "Export workspace as plugin"),
      React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 } }, "Last export: ", React.createElement("span", { className: "mono" }, "devdigest-acme-2026-05-28.zip"), " · 6 skills · 3 agents")),
    React.createElement(IntegrationCard, { icon: "Boxes", title: "Plugin Import", desc: "Install a shared workspace configuration" },
      React.createElement("div", { style: { border: "1.5px dashed var(--border-strong)", borderRadius: 9, padding: "20px", textAlign: "center", marginBottom: 12 } },
        React.createElement(window.Icon.Upload, { size: 22, style: { color: "var(--text-muted)" } }),
        React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 8 } }, "Drop a ", React.createElement("span", { className: "mono" }, ".zip"), " plugin here, or ", React.createElement("span", { style: { color: "var(--accent-text)" } }, "browse files…"))),
      [["owasp-skill-pack", true], ["frontend-guild-skills", false]].map((r, i) =>
        React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderRadius: 6, background: "var(--bg-surface)", marginTop: 6, fontSize: 12.5 } },
          React.createElement(window.Icon.Boxes, { size: 13, style: { color: "var(--text-muted)" } }),
          React.createElement("span", { className: "mono", style: { flex: 1, fontWeight: 600 } }, r[0]),
          React.createElement(window.Badge, { color: r[1] ? "var(--ok)" : "var(--text-muted)", dot: true }, r[1] ? "enabled" : "disabled"),
          React.createElement(window.MonoLink, null, r[1] ? "Disable" : "Remove")))));
}

function KeyField({ label, link, value, placeholder, status, helper, onTest, testing }) {
  const [show, setShow] = React.useState(false);
  const [v, setV] = React.useState(value || "");
  return React.createElement("div", { style: { marginBottom: 18 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", marginBottom: 7 } },
      React.createElement("label", { style: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" } }, label),
      link && React.createElement("span", { style: { marginLeft: "auto", fontSize: 12, color: "var(--accent-text)", display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer" } }, link, React.createElement(window.Icon.ArrowRight, { size: 11 }))),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 7, border: "1px solid var(--border-strong)", background: "var(--bg-surface)" } },
      React.createElement("input", { className: "mono", value: show ? v : (v ? "•".repeat(Math.max(0, Math.min(28, v.length - 4))) + v.slice(-4) : ""), onChange: (e) => setV(e.target.value), placeholder,
        style: { flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 13, color: "var(--text-primary)" } }),
      React.createElement(window.Icon[show ? "Eye" : "EyeOff"], { size: 14, style: { color: "var(--text-muted)", cursor: "pointer", flexShrink: 0 }, onClick: () => setShow((s) => !s) }),
      status && React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: "var(--ok)", flexShrink: 0 } },
        React.createElement(window.Icon.CheckCircle, { size: 13 }), status)),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 7 } },
      helper && React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 5 } },
        React.createElement(window.Icon.Lock, { size: 11 }), helper),
      onTest && React.createElement("div", { style: { marginLeft: "auto" } },
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: testing ? "RefreshCw" : "Play", onClick: onTest }, testing ? "Testing…" : "Test connection"))));
}

function SettingsApiKeys() {
  const [test, setTest] = React.useState(null);
  const run = (who) => { setTest({ who, state: "running" }); setTimeout(() => setTest({ who, state: "ok" }), 900); };
  return React.createElement("div", { style: { maxWidth: 640 } },
    React.createElement("h2", { style: { fontSize: 18, fontWeight: 700, marginBottom: 4 } }, "API Keys"),
    React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 } }, "Bring your own keys — every model call runs from your machine or your CI. Nothing passes through our servers."),
    React.createElement(KeyField, { label: "OpenRouter API key", link: "Where to get your key", value: "sk-or-v1-9f2c41ba7de08c5513a9f", placeholder: "sk-or-v1-…",
      status: "Connected", helper: "Stored locally on your machine — never uploaded.",
      testing: test && test.who === "or" && test.state === "running", onTest: () => run("or") }),
    test && test.who === "or" && test.state === "ok" && React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "var(--ok-bg)", border: "1px solid rgba(16,185,129,0.25)", marginBottom: 18, fontSize: 12.5, color: "var(--text-secondary)" } },
      React.createElement(window.Icon.CheckCircle, { size: 15, style: { color: "var(--ok)" } }),
      React.createElement("span", null, "Connection verified · ", React.createElement("span", { className: "mono" }, "anthropic/claude-sonnet-4"), " reachable · 142ms")),
    React.createElement(KeyField, { label: "OpenAI API key", link: "Optional", value: "", placeholder: "sk-… (only if you route directly to OpenAI)",
      helper: "Used only when an agent pins an OpenAI model.", testing: test && test.who === "oai" && test.state === "running", onTest: () => run("oai") }),
    React.createElement(window.FormField, { label: "Default model", hint: "Agents without an explicit model fall back to this one." },
      React.createElement(window.SelectInput, { value: "anthropic/claude-sonnet-4" })),
    React.createElement(window.FormField, { label: "Monthly spend cap", hint: "Runs stop when the cap is reached. $18.40 used this month." },
      React.createElement(window.TextInput, { value: "$50.00", mono: true })),
    React.createElement("div", { style: { display: "flex", gap: 9, padding: "11px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 } },
      React.createElement(window.Icon.Info, { size: 15, style: { flexShrink: 0, marginTop: 1 } }),
      React.createElement("span", null, "Keys live in ", React.createElement("span", { className: "mono", style: { color: "var(--text-secondary)" } }, "~/.devdigest/credentials"), ". For CI, add the same key as a repository secret — see ", React.createElement("b", { style: { color: "var(--text-secondary)" } }, "GitHub Integration"), ".")));
}

function SettingsGitHub() {
  return React.createElement("div", { style: { maxWidth: 640 } },
    React.createElement("h2", { style: { fontSize: 18, fontWeight: 700, marginBottom: 4 } }, "GitHub Integration"),
    React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 } }, "A personal access token lets DevDigest read pull requests and post review comments."),
    React.createElement(KeyField, { label: "Personal access token", link: "Create a token", value: "github_pat_11ABCD2yQ0k4Lm9xTf3e", placeholder: "github_pat_…",
      status: "Connected", helper: "Scopes: repo (read) · pull_requests (write)" }),
    React.createElement(window.FormField, { label: "Comment identity", hint: "Findings are posted under this account." },
      React.createElement(window.SelectInput, { value: "devdigest-bot" })),
    React.createElement(window.FormField, { label: "Connected repositories" },
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        [["acme/payments-api", "main", "indexed 2m ago"], ["acme/billing-worker", "main", "indexed 1h ago"]].map((r, i) =>
          React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-elevated)", fontSize: 12.5 } },
            React.createElement(window.Icon.GitBranch, { size: 13, style: { color: "var(--text-muted)" } }),
            React.createElement("span", { className: "mono", style: { fontWeight: 600, flex: 1 } }, r[0]),
            React.createElement(window.Badge, { color: "var(--text-muted)" }, r[1]),
            React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-muted)" } }, r[2]),
            React.createElement(window.MonoLink, null, "Remove"))),
        React.createElement("div", { style: { marginTop: 8 } }, React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Plus" }, "Add repository")))),
    React.createElement("div", { style: { display: "flex", gap: 9, padding: "11px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 } },
      React.createElement(window.Icon.Info, { size: 15, style: { flexShrink: 0, marginTop: 1 } }),
      React.createElement("span", null, "Blocking merges is branch protection, not a DevDigest setting — mark the CI check required in the repo's rules.")));
}

function SettingsWorkspace() {
  return React.createElement("div", { style: { maxWidth: 640 } },
    React.createElement("h2", { style: { fontSize: 18, fontWeight: 700, marginBottom: 4 } }, "Workspace"),
    React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 } }, "Where this workspace keeps its agents, skills, learnings, and run history."),
    React.createElement(window.FormField, { label: "Workspace name" }, React.createElement(window.TextInput, { value: "acme · payments" })),
    React.createElement(window.FormField, { label: "Data directory", hint: "Agents, skills, eval cases and traces are plain files — commit them or keep them local." },
      React.createElement(window.TextInput, { value: "~/.devdigest/acme-payments", mono: true })),
    React.createElement(window.FormField, { label: "Retention", hint: "Run traces older than this are pruned on startup." },
      React.createElement(window.SelectInput, { value: "90 days" })),
    React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 22 } },
      [["Agents", 3], ["Skills", 6], ["Eval cases", 12], ["Learnings", 24]].map(([l, n]) =>
        React.createElement("div", { key: l, style: { flex: 1, padding: "12px 14px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } },
          React.createElement("div", { className: "tnum", style: { fontSize: 20, fontWeight: 700 } }, n),
          React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } }, l)))),
    React.createElement("div", { style: { padding: 16, borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "var(--crit-bg)" } },
      React.createElement("div", { style: { fontSize: 13.5, fontWeight: 700, marginBottom: 4 } }, "Danger zone"),
      React.createElement("p", { style: { fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.5 } }, "Resetting clears runs, traces and learnings for this workspace. Agents and skills are kept. This cannot be undone."),
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Upload" }, "Export workspace"),
        React.createElement(window.Button, { kind: "secondary", size: "sm", icon: "Trash" }, "Reset run history"))));
}

function SettingsAbout() {
  return React.createElement("div", { style: { maxWidth: 560 } },
    React.createElement("h2", { style: { fontSize: 18, fontWeight: 700, marginBottom: 4 } }, "About"),
    React.createElement("p", { style: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 } }, "DevDigest runs locally: your keys, your repo, your machine."),
    React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", overflow: "hidden" } },
      [["Version", "0.7.2"], ["Runner", "runner.mjs · node 22"], ["Config format", "v3"], ["Updated", "2026-06-01"]].map((r, i, a) =>
        React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: i < a.length - 1 ? "1px solid var(--border)" : "none", fontSize: 12.5 } },
          React.createElement("span", { style: { color: "var(--text-secondary)", width: 130 } }, r[0]),
          React.createElement("span", { className: "mono", style: { fontWeight: 600 } }, r[1])))));
}

function ScreenSettings({ section = "Automatic Reviews", h = 760 }) {
  const [sec, setSec] = React.useState(section);
  return React.createElement(window.AppFrame, { active: "settings", h, crumb: [{ label: "Settings" }, { label: sec }] },
    React.createElement("div", { style: { display: "flex", height: h - 52 } },
      React.createElement("div", { style: { width: 210, flexShrink: 0, borderRight: "1px solid var(--border)", padding: 14, background: "var(--bg-surface)" } },
        React.createElement("h1", { style: { fontSize: 15, fontWeight: 700, padding: "2px 8px 12px" } }, "Settings"),
        SETTINGS_NAV.map((s) => {
          const on = sec === s;
          return React.createElement("div", { key: s, onClick: () => setSec(s), style: { padding: "7px 10px", borderRadius: 6, fontSize: 13, fontWeight: on ? 600 : 500, cursor: "pointer", color: on ? "var(--text-primary)" : "var(--text-secondary)", background: on ? "var(--bg-hover)" : "transparent", marginBottom: 2 } }, s);
        })),
      React.createElement("div", { style: { flex: 1, overflow: "auto", padding: "24px 28px" } },
        sec === "Automatic Reviews" ? React.createElement(SettingsAutoReviews)
        : sec === "Integrations" ? React.createElement(SettingsIntegrations)
        : sec === "API Keys" ? React.createElement(SettingsApiKeys)
        : sec === "GitHub Integration" ? React.createElement(SettingsGitHub)
        : sec === "Workspace" ? React.createElement(SettingsWorkspace)
        : React.createElement(SettingsAbout))));
}

Object.assign(window, { ScreenSettings });
