import type { IconName } from "@devdigest/ui";
import type { TourSectionKind } from "@devdigest/shared";

/** The five sections in the order a tour shows them. The title of a section is the message `sections.<kind>`;
    the kind doubles as the card's DOM id and the page-address anchor. */
export const TOUR_KINDS: readonly TourSectionKind[] = [
  "architecture_overview",
  "critical_paths",
  "how_to_run",
  "guided_reading",
  "first_tasks",
];

/** The icon of each section's card. */
export const SECTION_ICON: Record<TourSectionKind, IconName> = {
  architecture_overview: "Boxes",
  critical_paths: "Activity",
  how_to_run: "Command",
  guided_reading: "ListChecks",
  first_tasks: "Target",
};

/** Rows of the loading placeholder. */
export const SKELETON_ROWS = 4;

/** The server's error code for a start request while a generation already runs for the repository. */
export const GENERATION_IN_PROGRESS = "generation_in_progress";

/** How long a "Copied" / copy-failed confirmation stays visible. */
export const COPY_FEEDBACK_MS = 2000;

/** Distance kept above a card that was scrolled to the top of the visible area. */
export const SCROLL_OFFSET_PX = 14;

/** A section counts as "at the top" once its card starts within this many pixels of the scroll container's top. */
export const ACTIVE_THRESHOLD_PX = 90;
