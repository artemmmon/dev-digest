import { describe, it, expect } from "vitest";
import { formatStack, primaryFramework, otherFrameworks } from "./helpers";

const FLUTTER_STACK = {
  frameworks: [{ name: "Flutter", path: "" }],
  languages: [
    { name: "Dart", share: 0.92 },
    { name: "Kotlin", share: 0.05 },
  ],
  packages: ["flutter_bloc", "freezed", "dio"],
  detected_at: "2026-09-23T00:00:00.000Z",
};

describe("formatStack", () => {
  it("joins framework, languages (as rounded %) and packages", () => {
    expect(formatStack(FLUTTER_STACK)).toBe("Flutter · Dart 92% Kotlin 5% · flutter_bloc, freezed, dio");
  });

  it("adds a +N suffix to the primary framework when there are more", () => {
    const stack = { ...FLUTTER_STACK, frameworks: [{ name: "Next.js", path: "client" }, { name: "Fastify", path: "server" }] };
    expect(formatStack(stack)).toContain("Next.js +1");
  });

  it("returns null for null/undefined or a fully empty stack", () => {
    expect(formatStack(null)).toBeNull();
    expect(formatStack(undefined)).toBeNull();
    expect(formatStack({ frameworks: [], languages: [], packages: [], detected_at: "x" })).toBeNull();
  });

  it("omits a missing section instead of leaving a stray separator", () => {
    const stack = { frameworks: [{ name: "Dart", path: "" }], languages: [], packages: [], detected_at: "x" };
    expect(formatStack(stack)).toBe("Dart");
  });
});

describe("primaryFramework", () => {
  it("returns the first framework's name, or null", () => {
    expect(primaryFramework(FLUTTER_STACK)).toBe("Flutter");
    expect(primaryFramework(null)).toBeNull();
    expect(primaryFramework({ frameworks: [], languages: [], packages: [], detected_at: "x" })).toBeNull();
  });
});

describe("otherFrameworks", () => {
  it("lists every framework after the primary one", () => {
    const stack = {
      ...FLUTTER_STACK,
      frameworks: [{ name: "Next.js", path: "client" }, { name: "Fastify", path: "server" }, { name: "Node.js", path: "reviewer-core" }],
    };
    expect(otherFrameworks(stack)).toBe("Fastify, Node.js");
  });

  it("returns null when there is 0 or 1 framework", () => {
    expect(otherFrameworks(FLUTTER_STACK)).toBeNull();
    expect(otherFrameworks(null)).toBeNull();
  });
});
