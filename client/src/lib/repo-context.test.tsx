import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Repo } from "./types";

const state = vi.hoisted(() => ({
  pathname: "/" as string | null,
  repos: undefined as Repo[] | undefined,
  isSuccess: false,
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("./hooks", () => ({ useRepos: () => ({ data: state.repos, isSuccess: state.isSuccess }) }));

import { RepoProvider, useActiveRepo, useRepoNotFound } from "./repo-context";

const repo = (id: string): Repo => ({ id, full_name: `acme/${id}` }) as Repo;
const wrapper = ({ children }: { children: React.ReactNode }) => <RepoProvider>{children}</RepoProvider>;

beforeEach(() => {
  localStorage.clear();
  state.pathname = "/";
  state.repos = [repo("a"), repo("b")];
  state.isSuccess = true;
});
afterEach(() => localStorage.clear());

describe("RepoProvider", () => {
  it("defaults to the first repo", () => {
    const { result } = renderHook(() => useActiveRepo(), { wrapper });
    expect(result.current.repoId).toBe("a");
    expect(result.current.activeRepo?.full_name).toBe("acme/a");
  });

  it("the repo in the URL wins over the remembered one", () => {
    localStorage.setItem("dd-repo", "a");
    state.pathname = "/repos/b/pulls/3";
    const { result } = renderHook(() => useActiveRepo(), { wrapper });
    expect(result.current.repoId).toBe("b");
  });

  it("remembers the choice made with setRepoId, in state and in localStorage", () => {
    const { result } = renderHook(() => useActiveRepo(), { wrapper });
    act(() => result.current.setRepoId("b"));
    expect(result.current.repoId).toBe("b");
    expect(localStorage.getItem("dd-repo")).toBe("b");
  });

  it("uses a remembered repo on the next visit", async () => {
    localStorage.setItem("dd-repo", "b");
    const { result } = renderHook(() => useActiveRepo(), { wrapper });
    await vi.waitFor(() => expect(result.current.repoId).toBe("b"));
  });

  it("has no active repo before the list loads", () => {
    state.repos = undefined;
    state.isSuccess = false;
    const { result } = renderHook(() => useActiveRepo(), { wrapper });
    expect(result.current).toMatchObject({ repoId: null, activeRepo: null, reposLoaded: false, repos: [] });
  });
});

describe("useRepoNotFound", () => {
  const notFound = (id: string | null | undefined) => renderHook(() => useRepoNotFound(id), { wrapper }).result.current;

  it("is true only for an id the loaded list doesn't contain", () => {
    expect(notFound("ghost")).toBe(true);
    expect(notFound("a")).toBe(false);
    expect(notFound(null)).toBe(false);
    expect(notFound(undefined)).toBe(false);
  });

  it("stays false while repos are loading (no flash) and when the fetch failed", () => {
    state.repos = undefined;
    state.isSuccess = false;
    expect(notFound("ghost")).toBe(false);
  });
});
