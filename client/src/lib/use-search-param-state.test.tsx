import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), pathname: "/repos/r1/pulls/7" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
}));

import { useSearchParamState, useSearchParamsUpdate } from "./use-search-param-state";

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
});

describe("useSearchParamState", () => {
  it("reads the value, or the fallback when the param is absent", () => {
    nav.search = "tab=findings";
    expect(renderHook(() => useSearchParamState("tab", "overview")).result.current[0]).toBe("findings");
    nav.search = "";
    expect(renderHook(() => useSearchParamState("tab", "overview")).result.current[0]).toBe("overview");
    expect(renderHook(() => useSearchParamState("trace", null)).result.current[0]).toBeNull();
  });

  it("sets a param without dropping the others, replacing the history entry", () => {
    nav.search = "trace=run1";
    const { result } = renderHook(() => useSearchParamState("tab", "overview"));
    act(() => result.current[1]("diff"));
    expect(nav.replace).toHaveBeenCalledWith("/repos/r1/pulls/7?trace=run1&tab=diff");
  });

  it("null removes the param, and drops the query entirely when nothing is left", () => {
    nav.search = "trace=run1";
    const { result } = renderHook(() => useSearchParamState("trace", null));
    act(() => result.current[1](null));
    expect(nav.replace).toHaveBeenCalledWith("/repos/r1/pulls/7");
  });
});

describe("useSearchParamsUpdate", () => {
  it("changes several params in one navigation and keeps the rest", () => {
    nav.search = "skill=a&tab=stats&keep=1";
    const { result } = renderHook(() => useSearchParamsUpdate());
    act(() => result.current({ skill: "new", tab: null }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/repos/r1/pulls/7?skill=new&keep=1");
  });
});
