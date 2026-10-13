/**
 * The child-process environment of an eval session — no model.
 *   pnpm eval:static
 *
 * Under OpenRouter every model alias must resolve to the model under test: the project's subagents
 * declare `model: sonnet` / `opus`, and an alias left alone would be billed as a Claude model.
 */

import { afterEach, describe, expect, test, vi } from "vitest";

const KEYS = ["EVAL_BACKEND", "EVAL_MODEL", "OPENROUTER_API_KEY", "OPENROUTER_BASE_URL", "ANTHROPIC_API_KEY"];

async function envFor(vars: Record<string, string>) {
  vi.resetModules();
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  const { subscriptionEnv } = await import("./env.js");
  return subscriptionEnv();
}

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("subscriptionEnv", () => {
  test("openrouter: every alias, the small model and subagents use EVAL_MODEL", async () => {
    const env = await envFor({
      EVAL_BACKEND: "openrouter",
      EVAL_MODEL: "deepseek/deepseek-v4-flash",
      OPENROUTER_API_KEY: "sk-or-test",
      OPENROUTER_BASE_URL: "http://localhost:4000/",
    });
    for (const k of [
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
      "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      "ANTHROPIC_SMALL_FAST_MODEL",
      "CLAUDE_CODE_SUBAGENT_MODEL",
    ]) {
      expect(env[k], k).toBe("deepseek/deepseek-v4-flash");
    }
    expect(env.ANTHROPIC_BASE_URL).toBe("http://localhost:4000");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-or-test");
    expect(env.ANTHROPIC_API_KEY).toBe("");
  });

  test("openrouter without a key is an error, not a silent fallback to the subscription", async () => {
    await expect(envFor({ EVAL_BACKEND: "openrouter", EVAL_MODEL: "x/y" })).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  test("subscription: an API key in the environment is removed and no alias is pinned", async () => {
    const env = await envFor({ ANTHROPIC_API_KEY: "sk-ant-leak", EVAL_MODEL: "claude-haiku-5-5" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CLAUDE_CODE_SUBAGENT_MODEL).toBeUndefined();
  });
});
