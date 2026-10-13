import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";

// A case on a verbose model can generate for minutes; CI raises this through the environment.
const TEST_TIMEOUT = Number(process.env.EVAL_TEST_TIMEOUT_MS ?? "240000");

export default defineConfig({
  test: {
    // *.eval.ts = model-backed evals; src/**/*.test.ts = the pure stats unit tests.
    include: ["**/*.eval.ts", "src/**/*.test.ts"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room.
    testTimeout: TEST_TIMEOUT,
    hookTimeout: TEST_TIMEOUT,
    // One session per test; a few files can run concurrently. Keep it modest to stay cheap.
    fileParallelism: true,
    reporters: ["default", new TrendReporter()],
  },
});
