import type { SignalSummary } from "@shared/types/signal.types";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSignalStore } from "@/stores/signal-store";
import SignalDock from "./SignalDock";

// Mock the Tauri APIs — the dock must work without a real backend.
vi.mock("@/lib/signal-api", () => ({
  getSignalSummary: vi.fn(async () => EMPTY),
  subscribeSignalUpdates: vi.fn(async () => () => {}),
  clearSignal: vi.fn(async () => {}),
}));

vi.mock("@/lib/tauri-window", () => ({
  getCurrentWindow: vi.fn(() => ({
    onFocusChanged: vi.fn(async () => () => {}),
  })),
  getCurrentWindowLabel: vi.fn(() => "signal-dock"),
}));

const EMPTY: SignalSummary = {
  sessions: {},
  idle: 0,
  running: 0,
  failed: 0,
  success: 0,
  total: 0,
};

const SAMPLE: SignalSummary = {
  sessions: {
    "/home/wa/project/work-board": "running",
    "/home/wa/project/deploy": "failed",
    "/home/wa/.agents": "success",
    "/home/wa/docs": "idle",
  },
  idle: 1,
  running: 1,
  failed: 1,
  success: 1,
  total: 4,
};

describe("SignalDock", () => {
  beforeEach(() => {
    useSignalStore.getState().reset();
  });

  it("shows four counters with correct counts in expanded mode", () => {
    act(() => {
      useSignalStore.getState().setSummary(SAMPLE);
    });
    render(<SignalDock />);

    expect(screen.getByTestId("signal-dock")).toBeTruthy();
    // 失败 1, 运行中 1, 空闲 1, 已完成 1
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText("失败").length).toBeGreaterThan(0);
    expect(screen.getAllByText("运行中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("空闲").length).toBeGreaterThan(0);
    expect(screen.getAllByText("成功").length).toBeGreaterThan(0);
  });

  it("renders each session in its state group with friendly name", () => {
    act(() => {
      useSignalStore.getState().setSummary(SAMPLE);
    });
    render(<SignalDock />);

    // Path basenames as display names
    expect(screen.getByText("deploy")).toBeTruthy();
    expect(screen.getByText("work-board")).toBeTruthy();
    expect(screen.getByText(".agents")).toBeTruthy();
    expect(screen.getByText("docs")).toBeTruthy();

    // Grouped under the right state
    expect(screen.getAllByTestId("dock-session-failed").length).toBe(1);
    expect(screen.getAllByTestId("dock-session-running").length).toBe(1);
    expect(screen.getAllByTestId("dock-session-idle").length).toBe(1);
    expect(screen.getAllByTestId("dock-session-success").length).toBe(1);
  });

  it("shows empty state when no sessions", () => {
    render(<SignalDock />);
    expect(screen.getByText("暂无任务")).toBeTruthy();
  });

  it("dims lights whose count is zero (light off)", () => {
    // Empty summary: every counter is 0 → each dot dims to its own hue's
    // low-saturation version (not a flat gray).
    render(<SignalDock />);
    for (const dimClass of [
      "bg-red-200",
      "bg-yellow-200",
      "bg-slate-300",
      "bg-green-200"
    ]) {
      expect(document.querySelectorAll(`span.${dimClass}`).length).toBeGreaterThan(0);
    }
  });

  it("collapses to compact mode showing all four lights", () => {
    act(() => {
      useSignalStore.getState().setSummary(SAMPLE);
    });
    render(<SignalDock />);

    act(() => {
      screen.getByLabelText("收起").click();
    });
    expect(screen.getByTestId("signal-dock-compact")).toBeTruthy();
    // All four state counters are visible vertically, not just the dominant one.
    expect(screen.getByLabelText("失败")).toBeTruthy();
    expect(screen.getByLabelText("运行中")).toBeTruthy();
    expect(screen.getByLabelText("空闲")).toBeTruthy();
    expect(screen.getByLabelText("成功")).toBeTruthy();
    // Each shows its count.
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(4);

    // Click expands back
    act(() => {
      screen.getByLabelText("展开").click();
    });
    expect(screen.getByTestId("signal-dock")).toBeTruthy();
  });

  it("shows alert card on failed change and it persists", () => {
    act(() => {
      useSignalStore.getState().setSummary(SAMPLE);
    });
    render(<SignalDock />);

    act(() => {
      useSignalStore.getState().applyUpdate(
        {
          ...SAMPLE,
          sessions: { ...SAMPLE.sessions, "/home/wa/project/deploy": "failed" },
          failed: 1,
        },
        { session: "/home/wa/project/deploy", state: "failed", level: "alert", removed: false },
      );
    });

    expect(screen.getByTestId("dock-card-alert")).toBeTruthy();
    // The card shows the session's friendly name
    const card = screen.getByTestId("dock-card-alert");
    expect(card.textContent).toContain("deploy");
    expect(card.textContent).toContain("失败");
  });

  it("does not show a card for none-level changes (process turns)", () => {
    act(() => {
      useSignalStore.getState().setSummary(SAMPLE);
    });
    render(<SignalDock />);

    act(() => {
      useSignalStore.getState().applyUpdate(SAMPLE, {
        session: "/home/wa/project/work-board",
        state: "running",
        level: "none",
        removed: false,
      });
    });

    expect(screen.queryByTestId("dock-card-alert")).toBeNull();
    expect(screen.queryByTestId("dock-card-info")).toBeNull();
  });

  it("dismisses a card on close", async () => {
    act(() => {
      useSignalStore.getState().setSummary(SAMPLE);
    });
    render(<SignalDock />);

    act(() => {
      useSignalStore
        .getState()
        .applyUpdate(
          { ...SAMPLE },
          { session: "/home/wa/project/deploy", state: "failed", level: "alert", removed: false },
        );
    });
    expect(screen.getByTestId("dock-card-alert")).toBeTruthy();

    act(() => {
      screen.getByLabelText("关闭通知").click();
    });
    // AnimatePresence exit completes asynchronously — wait for removal.
    await waitFor(() => {
      expect(screen.queryByTestId("dock-card-alert")).toBeNull();
    });
  });
});
