import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CrumbProvider, useCrumb, usePageCrumb } from "./crumb";

afterEach(cleanup);

function Shell() {
  const crumb = useCrumb();
  return <nav data-testid="crumb">{crumb.map((c) => c.label).join(" > ")}</nav>;
}

function Page({ name }: { name: string }) {
  usePageCrumb([{ label: "Home" }, { label: name }]);
  return null;
}

describe("usePageCrumb", () => {
  it("sets the crumb the shell reads", () => {
    render(
      <CrumbProvider>
        <Shell />
        <Page name="Agents" />
      </CrumbProvider>,
    );
    expect(screen.getByTestId("crumb")).toHaveTextContent("Home > Agents");
  });

  it("follows a page whose crumb changes, and clears it when the page unmounts", () => {
    const { rerender } = render(
      <CrumbProvider>
        <Shell />
        <Page name="One" />
      </CrumbProvider>,
    );
    rerender(
      <CrumbProvider>
        <Shell />
        <Page name="Two" />
      </CrumbProvider>,
    );
    expect(screen.getByTestId("crumb")).toHaveTextContent("Home > Two");

    rerender(
      <CrumbProvider>
        <Shell />
      </CrumbProvider>,
    );
    expect(screen.getByTestId("crumb")).toHaveTextContent("");
  });

  it("does nothing (and does not throw) outside a provider", () => {
    render(<Page name="Solo" />);
  });
});
