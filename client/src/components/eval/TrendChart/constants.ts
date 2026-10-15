/** Height of the plot in px; the width follows the container. */
export const TREND_CHART_HEIGHT = 200;

/** The metric axis is a whole percentage, like the metric cards (AC-37). */
export const TREND_Y_DOMAIN: [number, number] = [0, 100];
export const TREND_Y_TICKS = [0, 25, 50, 75, 100];

/** i18n key (under `eval.trendChart.legend`) of each plotted metric. */
export const TREND_LEGEND_KEY = {
  recall: "recall",
  precision: "precision",
  citation_accuracy: "citation",
} as const;
