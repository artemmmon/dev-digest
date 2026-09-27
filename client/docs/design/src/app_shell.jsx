/* app_shell.jsx — turns the design screens into a navigable mock app.
   Overrides window.AppFrame (must load AFTER chrome.jsx and all screen_*.jsx). */

const ShellCtx = React.createContext({ route: "dashboard", navigate: () => {}, back: () => {}, canBack: false });

// Only routes that own the full shell live here — canvas-only composites (trace / export
// wizard / eval-case modal) are reachable in-flow and would trap the user as standalone routes.
const EXTRA_NAV = [
  { key: "conformance", label: "Conformance", icon: "ListChecks" },
  { key: "onboarding", label: "First-run setup", icon: "Sparkles" },
];

function ShellNavItem({ item, active, onClick }) {
  const I = window.Icon[item.icon] || window.Icon.Boxes;
  const [h, setH] = React.useState(false);
  const on = active === item.key;
  return React.createElement("div", {
    onClick, onMouseEnter: () => setH(true), onMouseLeave: () => setH(false),
    style: { display: "flex", alignItems: "center", gap: 10, padding: "6px 9px", borderRadius: 6, fontSize: 13,
      fontWeight: on ? 600 : 500, cursor: "pointer", position: "relative",
      color: on ? "var(--text-primary)" : (h ? "var(--text-primary)" : "var(--text-secondary)"),
      background: on ? "var(--bg-hover)" : (h ? "var(--bg-elevated)" : "transparent"), transition: "background .12s, color .12s" },
  },
    on && React.createElement("span", { style: { position: "absolute", left: -8, top: 7, bottom: 7, width: 2.5, borderRadius: 2, background: "var(--accent)" } }),
    React.createElement(I, { size: 16, style: { color: on ? "var(--accent)" : "inherit" } }),
    React.createElement("span", { style: { flex: 1 } }, item.label),
    item.badge && React.createElement("span", { className: "tnum", style: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 99, padding: "0 6px", minWidth: 18, textAlign: "center" } }, item.badge));
}

function ShellSidebar({ active }) {
  const { navigate } = React.useContext(ShellCtx);
  const groups = window.NAV.concat([{ section: "MORE SCREENS", items: EXTRA_NAV }]);
  return React.createElement("aside", {
    style: { width: 224, flexShrink: 0, background: "var(--bg-surface)", borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column", padding: "12px 12px 10px", gap: 2, overflow: "hidden" },
  },
    React.createElement("div", { onClick: () => navigate("dashboard"), style: { display: "flex", alignItems: "center", gap: 9, padding: "2px 4px 12px", cursor: "pointer" } },
      React.createElement("div", { style: { width: 26, height: 26, borderRadius: 7, background: "var(--text-primary)", display: "grid", placeItems: "center", flexShrink: 0 } },
        React.createElement(window.Icon.Layers, { size: 15, style: { color: "var(--bg-primary)" } })),
      React.createElement("span", { style: { fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" } }, "DevDigest")),
    React.createElement("div", {
      style: { display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", margin: "0 0 6px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-elevated)", cursor: "pointer" },
    },
      React.createElement("div", { style: { width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "grid", placeItems: "center", flexShrink: 0 } },
        React.createElement(window.Icon.GitBranch, { size: 14, style: { color: "#fff" } })),
      React.createElement("div", { style: { flex: 1, minWidth: 0 } },
        React.createElement("div", { className: "mono", style: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, "acme/payments-api"),
        React.createElement("div", { style: { fontSize: 10.5, color: "var(--text-muted)" } }, "main · synced 2m ago")),
      React.createElement(window.Icon.ChevronsUpDown, { size: 14, style: { color: "var(--text-muted)" } })),
    React.createElement("div", { style: { overflowY: "auto", flex: 1, margin: "4px -4px 0", padding: "0 4px" } },
      groups.map((grp, gi) => React.createElement("div", { key: gi, style: { marginBottom: 14 } },
        React.createElement("div", { style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", padding: "0 9px", marginBottom: 6 } }, grp.section),
        grp.items.map((it) => React.createElement(ShellNavItem, { key: it.key, item: it, active, onClick: () => navigate(it.key) }))))),
    React.createElement("div", { style: { borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 2 } },
      React.createElement(ShellNavItem, { item: { key: "settings", label: "Settings", icon: "Settings" }, active, onClick: () => navigate("settings") })));
}

function ShellTopbar({ crumb }) {
  const { back, canBack } = React.useContext(ShellCtx);
  return React.createElement("header", {
    style: { height: 52, flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--bg-primary)", display: "flex", alignItems: "center", gap: 14, padding: "0 18px" },
  },
    canBack && React.createElement("button", {
      onClick: back, title: "Back",
      style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 7, cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 600,
        border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)" } },
      React.createElement(window.Icon.ChevronLeft || window.Icon.ChevronRight, { size: 14 }), "Back"),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, minWidth: 0 } },
      crumb && crumb.map((c, i) => React.createElement(React.Fragment, { key: i },
        i > 0 && React.createElement(window.Icon.ChevronRight, { size: 13, style: { color: "var(--text-muted)", flexShrink: 0 } }),
        React.createElement("span", { className: c.mono ? "mono" : undefined, style: { fontSize: 13, fontWeight: i === crumb.length - 1 ? 600 : 500, color: i === crumb.length - 1 ? "var(--text-primary)" : "var(--text-secondary)", whiteSpace: "nowrap" } }, c.label)))),
    React.createElement("div", {
      style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, width: 260, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-muted)", fontSize: 12.5 },
    },
      React.createElement(window.Icon.Search, { size: 14 }),
      React.createElement("span", { style: { flex: 1 } }, "Search or jump to…"),
      React.createElement(window.Kbd, null, "⌘K")),
    React.createElement(window.IconBtn, { icon: "RefreshCw", label: "Refresh" }),
    React.createElement(window.IconBtn, { icon: "Bell", label: "Notifications" }),
    React.createElement(window.Avatar, { name: "you", size: 26 }));
}

// Live app frame: same chrome, but the sidebar navigates and the shell owns the viewport.
function ShellFrame({ active, crumb, children }) {
  return React.createElement("div", {
    "data-screen-label": active,
    style: { display: "flex", width: "100%", height: "100vh", background: "var(--bg-primary)", alignItems: "stretch", overflow: "hidden" },
  },
    React.createElement(ShellSidebar, { active }),
    React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } },
      React.createElement(ShellTopbar, { crumb }),
      React.createElement("main", { style: { flex: 1, minHeight: 0, overflow: "auto" } },
        React.createElement("div", { style: { minWidth: 1100 } }, children))));
}

const ROUTES = {
  dashboard: (h) => React.createElement(window.ScreenDashboard, { h }),
  pr: (h) => React.createElement(window.ScreenPRDetail, { h, blastView: "tree", tab: "overview" }),
  "onboarding-tour": (h) => React.createElement(window.ScreenTour, { h }),
  context: (h) => React.createElement(window.ScreenContext, { h }),
  skills: (h) => React.createElement(window.ScreenSkillsLab, { h, tab: "Config" }),
  agents: (h) => React.createElement(window.ScreenAgents, { h, tab: "Config" }),
  conventions: (h) => React.createElement(window.ScreenConventions, { h }),
  eval: (h) => React.createElement(window.ScreenEval, { h }),
  memory: (h) => React.createElement(window.ScreenMemory, { h }),
  personas: (h) => React.createElement(window.ScreenMultiAgent, { h, phase: "config", prNum: 482 }),
  "agent-perf": (h) => React.createElement(window.ScreenAgentPerf, { h }),
  "ci-runs": (h) => React.createElement(window.ScreenCIRuns, { h }),
  settings: (h) => React.createElement(window.ScreenSettings, { h }),
  conformance: (h) => React.createElement(window.ScreenConformance, { h }),
  onboarding: (h) => React.createElement(ShellFrame, { active: "onboarding", crumb: [{ label: "First-run setup" }] },
    React.createElement(window.ScreenOnboarding, { h: h - 52 })),
};

const ROUTE_KEY = "devdigest.app.route";

function AppRouter() {
  const [stack, setStack] = React.useState(() => {
    try { const s = localStorage.getItem(ROUTE_KEY); if (s && ROUTES[s]) return [s]; } catch (e) {}
    return ["dashboard"];
  });
  const [vh, setVh] = React.useState(() => window.innerHeight);
  React.useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const route = stack[stack.length - 1];
  React.useEffect(() => { try { localStorage.setItem(ROUTE_KEY, route); } catch (e) {} }, [route]);

  const navigate = React.useCallback((key) => { if (ROUTES[key]) setStack([key]); }, []);
  const push = React.useCallback((key) => { if (ROUTES[key]) setStack((s) => s.concat([key])); }, []);
  const back = React.useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") back(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  React.useEffect(() => {
    window.__ddNavigate = navigate;
    window.__ddPush = push;
    window.__ddOpenPR = () => push("pr");
  }, [navigate, push]);

  const ctx = React.useMemo(() => ({ route, navigate, back, canBack: stack.length > 1 }), [route, navigate, back, stack.length]);
  return React.createElement(ShellCtx.Provider, { value: ctx },
    React.createElement("div", { key: route }, ROUTES[route](vh)));
}

window.AppFrame = ShellFrame;
Object.assign(window, { AppRouter, ShellCtx, ShellFrame });
