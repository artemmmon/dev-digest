---
name: react-best-practices
description: "Modern React best practices and anti-pattern catalog (2025-26). Use when writing, reviewing, or refactoring React components, hooks, and state management. Covers component design, state patterns, hooks misuse, performance, data fetching, and code organization."
---

# React Best Practices & Anti-Patterns

Modern React conventions (2025-26). Covers what to do and what to avoid. For code examples, see [examples.md](examples.md).

## Severity Levels

Each rule is tagged with a severity for use by consuming agents:

- **CRITICAL** — Will cause bugs, broken reconciliation, or maintenance nightmares
- **HIGH** — Will cause performance issues or scaling problems
- **MEDIUM** — Will hurt maintainability or developer experience

---

## Component Design (CRITICAL)

- Components must be pure — same inputs = same outputs, no side effects during render
- Business logic in hooks/helpers, NOT in component bodies
- Container components fetch data; presentational components receive props and render UI
- Helper functions extracted OUTSIDE the component body
- Max 200 lines per component — split if larger
- Max 5-7 props — more suggests the component does too much
- One component per file (small colocated internal helpers are fine)

### Composition Patterns

- Compose small focused components over monolithic ones
- "Lift Content Up" — move children to the parent when the wrapper doesn't use them for logic
- "Push State Down" — keep state in the component that actually needs it
- Prefer `children` prop and composition over deep prop drilling

## Derive, Don't Store (CRITICAL)

The #1 React anti-pattern. Look for it in every review.

- NEVER store derived values in `useState` — compute during render
- NEVER use `useState` + `useEffect` to sync a computed value — just compute it
- Use `useMemo` ONLY if the computation is expensive (measured, not assumed)
- If a value can be calculated from existing props/state, calculate it inline

## State Management (HIGH)

### State Location
- Colocate state with the components that use it
- Don't lift state higher than necessary — it causes unnecessary re-renders
- Don't duplicate state across components

### Context API
- Context is for dependency injection (auth, theme), NOT global state management
- Context changes re-render ALL consumers — split contexts by concern
- Prefer hook return values over Context when only one subtree needs the data

### State Hygiene
- Not everything needs to be in `useState` — only values that change over time and affect the UI
- Combine related state with `useReducer` instead of multiple `useState` calls
- URL-dependent state (filters, pagination, search) belongs in URL search params, not component state

## Hooks (HIGH)

### useEffect Rules
Before each `useEffect`, ask: **Is there an external system being synchronized?** If no, it's misused.

- NEVER use `useEffect` for derived state — compute during render
- NEVER use `useEffect` for event handling — put logic in the event handler
- NEVER chain `useEffect`s that trigger each other — usually means derived state
- ALWAYS declare all dependencies correctly
- ALWAYS clean up subscriptions, timers, and event listeners

### Memoization Rules
Most `useMemo`/`useCallback` calls are unnecessary. Be skeptical:

- `useMemo` — only for actually expensive computations (sorting large datasets, complex transforms)
- `useCallback` — only when the function is passed to a `React.memo` child
- Simple string concatenation, arithmetic, or boolean checks do NOT need memoization

## Render Factories (CRITICAL)

camelCase functions returning JSX are NOT React components. They break reconciliation, hooks, and dev tools.

- NEVER use `renderThing()` pattern — use `<Thing />` component syntax
- ALWAYS use PascalCase for anything that returns JSX
- Render factories lose component identity on every render, causing full unmount/remount

## Inline Creation in JSX (HIGH)

New arrays, objects, and functions created inline in JSX props break `React.memo` on children.

- Extract static arrays/objects to module-level constants
- Extract dynamic arrays/objects to `useMemo`
- Extract inline functions to `useCallback` (only when passed to memoized children)

## Over-Engineering (CRITICAL)

### Premature Abstraction
- Abstractions with only one consumer are premature — inline it
- "Reusable" hooks with hardcoded field names are not reusable — accept config as parameters
- Context storing state that could be computed locally is over-engineered

### Wrapper Components
- Components that only call a hook and return `null` are unnecessary — call the hook directly
- Wrappers that only pass props through add indirection without value

## Data Fetching (HIGH)

- ALL data fetching in custom hooks, never in component bodies
- Use the TanStack Query hooks in `src/lib/hooks/<domain>.ts` (built on `apiFetch`, keys from `src/lib/query-keys.ts`)
- Handle loading, error, and empty states in the container component
- Use try-catch in async functions within hooks

## Styling (MEDIUM)

- Follow the local convention: `CSSProperties` objects (using the design CSS variables) in the
  component's or route's `styles.ts`, applied as `style={s.x}`, plus the global design classes
  (`className="mono"` etc.). Don't flag `style={s.x}`; do flag large inline `style={{…}}` literals
  that belong in `styles.ts`
- Extract repeated visual patterns into reusable components (Button, Card, Badge)
- Prefer the vendored UI kit `src/vendor/ui/` (`@devdigest/ui`) over recreating common elements

## Error Boundaries (HIGH)

- In the Next App Router a route's error boundary is its `error.tsx` (see `next-best-practices`);
  add a component-level boundary only around a sub-tree that can fail on its own
- Give the fallback a "Try again" action that calls `reset`
- Error boundaries do NOT catch errors in event handlers, async code, or SSR — use try/catch there

## Key Prop Patterns (CRITICAL)

- NEVER use array index as `key` when lists can be reordered, filtered, or modified
- NEVER use `Math.random()` or other unstable values as keys — causes full unmount/remount
- When mapping Fragments, put `key` on `<React.Fragment key={id}>`, not on a child

## Conditional Rendering (HIGH)

- NEVER use `{count && <Component />}` when `count` can be `0` — renders literal `0`
- Use `{count > 0 && <Component />}` or ternary instead
- Replace nested ternaries with early returns or extracted components
- For multiple UI states (loading/error/empty/success), use early returns pattern

## Accessibility (HIGH)

- Add `aria-label` to icon-only buttons — without it, they're invisible to screen readers
- Link error messages to fields with `aria-describedby` and `aria-invalid`
- Use `aria-live="polite"` for dynamic content updates (search results, notifications, toasts)
- Trap focus inside modals; provide escape path (Escape key + visible Close button)
- Announce route changes for screen readers (SPA navigation is silent by default)

## Performance Beyond Memoization (MEDIUM)

- Next splits code per route automatically; for a heavy client-only component use `next/dynamic`
  with a static import path

## React 19 Patterns (MEDIUM)

- Accept `ref` as a regular prop instead of using `forwardRef` (React 19+)
- With React Compiler enabled, avoid adding `memo`/`useMemo`/`useCallback` unless measured

## Code Organization (MEDIUM)

> For architecture decisions (where files go, feature layout, business logic placement, import boundaries) use the `frontend-architecture` skill.

### Feature-Based Structure
- Colocate component + hook + helpers + tests per feature
- Shared helpers go in `src/lib/`, shared chrome in `src/components/` (see `frontend-architecture`)

### File Quality
- Order: imports, constants, helpers, component, exports
- Reuse existing types and constants over creating new ones
