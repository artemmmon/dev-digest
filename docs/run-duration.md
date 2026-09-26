# Run duration

`formatRunDuration` (`server/src/modules/_shared/run-duration.ts`) turns a run's duration into a short
human-readable string with [pretty-ms](https://github.com/sindresorhus/pretty-ms). A run without a
duration yet is shown as `running`. `formatRoundDuration` sums the runs of one review round.
