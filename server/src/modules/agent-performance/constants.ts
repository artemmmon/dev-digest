/** Run statuses that count toward the performance figures; a `running` run is not counted until it ends. */
export const COUNTED_RUN_STATUSES = ['done', 'failed', 'cancelled'] as const;

/** Length of the rolling windows, in hours (the window ends when the figures are read). */
export const WINDOW_HOURS = { '1d': 24, '30d': 720 } as const;

/**
 * Money is summed in integer nano-USD so cost-by-agent and cost-by-model slices equal the total
 * exactly (`agent_runs.cost_usd` is a double; floats added in different orders drift).
 */
export const COST_UNITS_PER_USD = 1e9;

export const MS_PER_HOUR = 3_600_000;
