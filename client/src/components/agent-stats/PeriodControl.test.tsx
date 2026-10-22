import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test/render";
import { PeriodControl } from "./PeriodControl";
import type { StatsPeriodSelection } from "@/lib/stats-period";

// "Today" is fixed so the date limits do not depend on the day the tests run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

function setup(value: StatsPeriodSelection = { period: "30d" }) {
  const onChange = vi.fn();
  const view = renderWithIntl(<PeriodControl value={value} onChange={onChange} />);
  return { onChange, ...view };
}

const periodSelect = () => screen.getByRole("combobox", { name: "Period" });

describe("PeriodControl", () => {
  it("AC-4: offers 1 day, 30 days and Custom range", () => {
    setup();
    const options = Array.from(periodSelect().querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["1 day", "30 days", "Custom range"]);
  });

  it("shows the applied period", () => {
    setup({ period: "1d" });
    expect(periodSelect()).toHaveValue("1d");
  });

  it("choosing 1 day or 30 days applies it at once", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onChange } = setup({ period: "30d" });
    await user.selectOptions(periodSelect(), "1d");
    expect(onChange).toHaveBeenCalledWith({ period: "1d" });
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
  });

  it("AC-7: choosing Custom range asks for a start date and an end date, without changing the period yet", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onChange } = setup();
    await user.selectOptions(periodSelect(), "custom");
    expect(screen.getByLabelText("From")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("To")).toHaveAttribute("type", "date");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies a valid custom range", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onChange } = setup();
    await user.selectOptions(periodSelect(), "custom");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-07" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ period: "custom", from: "2026-10-01", to: "2026-10-07" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("AC-8 / AC-9: a start date after the end date shows a message next to the fields and applies nothing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onChange } = setup();
    await user.selectOptions(periodSelect(), "custom");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-09" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("The start date must not be after the end date.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("AC-8 / AC-9: an end date after today shows a message and applies nothing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onChange } = setup();
    await user.selectOptions(periodSelect(), "custom");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-22" } });
    expect(screen.getByRole("alert")).toHaveTextContent("The end date must not be after today.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("AC-8: the message goes away once the range is corrected", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onChange } = setup();
    await user.selectOptions(periodSelect(), "custom");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-09" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-01" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith({ period: "custom", from: "2026-10-01", to: "2026-10-01" });
  });

  it("shows an applied custom range with its dates", () => {
    setup({ period: "custom", from: "2026-10-01", to: "2026-10-07" });
    expect(periodSelect()).toHaveValue("custom");
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-10-07");
  });

  it("NFR-3: the period select and both date fields are native, labelled controls reachable with Tab", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({ period: "custom", from: "2026-10-01", to: "2026-10-07" });
    await user.tab();
    expect(periodSelect()).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("From")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("To")).toHaveFocus();
  });

  it("the date fields cannot pick a day after today", () => {
    setup({ period: "custom", from: "2026-10-01", to: "2026-10-07" });
    expect(screen.getByLabelText("To")).toHaveAttribute("max", "2026-10-21");
  });
});
