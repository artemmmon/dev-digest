# Building overlay UI when the kit has no overlay primitive

`@devdigest/ui` has no Popover, Tooltip, HoverCard or Portal, and no positioning
helper — a grep for `createPortal|useFloating|getBoundingClientRect` over `src/`
returns nothing. Every overlay in this app is therefore hand-built from the same
four pieces. This is the house pattern, extracted from the FINDINGS popover on the
PR list (L01); read it before adding a floating-UI dependency.

## The pattern

**1. A relative wrapper and an absolute child.** The kit's `Dropdown`
(`src/vendor/ui/kit/Dropdown.tsx:88`) is the reference: the trigger's wrapper is
`position: relative`, the panel is `position: absolute` with a `zIndex`, and it
animates in with the `ddpop` keyframes from `src/vendor/ui/styles.css:255`. Copy
that; do not reach for a library.

**2. The offset belongs to a padded wrapper, never a margin.** A `marginTop: 8`
under a hover panel makes it unreachable: margins are not hit-testable, so that
strip belongs to neither element. The pointer crosses it, `mouseleave` fires on the
trigger, and the panel unmounts before it can be entered. Put the gap in the
**padding** of an invisible positioned wrapper around the card
(`src/app/repos/[repoId]/pulls/_components/FindingsCell/_components/FindingsPopover/styles.ts:11`,
the `anchor` style). `Dropdown.tsx:89` has the
same dead gap via `top: calc(100% + 6px)`, but it is click-triggered, so it never
bites.

**3. Let the DOM do the hover bookkeeping.** Render the panel as a **child** of the
trigger. `mouseenter` / `mouseleave` treat descendants as part of the element, so
landing on the panel re-fires the trigger's `onMouseEnter`: no handlers on the panel
itself, no shared "is the pointer in either of these two boxes" state. Add a short
close delay for the diagonal approach — the trigger is ~80px wide, the card 360px —
and clear the timer on unmount so nothing fires after a refetch or navigation
(`src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx:21` and `:57`).

**4. Flip from the caller, not from measurement.** Without a positioning library,
a panel near the bottom of the page would need `getBoundingClientRect` and a
re-render to know it overflows. The list already knows a row's index, so it passes
`placement="up"` for rows in the lower half (`src/app/repos/[repoId]/pulls/page.tsx:136`) and the anchor
style swaps `top`/`bottom`. Cheap, deterministic, and it survives SSR.

## What bites around it

**A clipping ancestor.** `overflow: hidden` anywhere above the panel (used for
rounded corners on cards and tables) renders it invisibly below the fold. The PR
list's table card needed `overflow: visible` (`src/app/repos/[repoId]/pulls/styles.ts:86`); its rows have
their own borders, so nothing else relied on the clip.

**Accessible names concatenate without a separator.** A pill rendering
`<span>{n}</span>` next to a label computes the name `"2Warning"`, so
`getByRole("button", { name: "2 Warning" })` and the e2e `find role button --name`
both miss it. Give such buttons an explicit `aria-label={`${n} ${label}`}`
(`src/app/repos/[repoId]/pulls/[number]/_components/SeverityFilterPills/SeverityFilterPills.tsx:42`); the e2e flows target them by exactly that name.

**Fetch on hover, not on render.** The PR list never loads findings — the popover
enables its query only while hovered (`usePrReviews(pr.id, { enabled: hovered })`),
so a list of 50 PRs costs one request, not 50.

## Where a new overlay belongs

Keep it in the feature's `_components/` folder until a second page needs it; only
then promote it to `src/components/` or the kit. The FINDINGS popover lives at
`src/app/repos/[repoId]/pulls/_components/FindingsCell/_components/FindingsPopover/`
for exactly that reason.
