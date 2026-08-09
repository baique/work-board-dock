import type { SignalSummary } from "@shared/types/signal.types";
import { beforeEach, describe, expect, it } from "vitest";
import { useSignalStore } from "./signal-store";

describe("signal-store", () => {
  beforeEach(() => {
    useSignalStore.getState().reset();
  });

  it("starts empty", () => {
    expect(useSignalStore.getState().summary.total).toBe(0);
  });

  it("setSummary replaces the whole summary", () => {
    const summary: SignalSummary = {
      sessions: { a: "running", b: "failed", c: "success" },
      idle: 0,
      running: 1,
      failed: 1,
      success: 1,
      total: 3,
    };
    useSignalStore.getState().setSummary(summary);
    expect(useSignalStore.getState().summary).toEqual(summary);
  });

  it("reset clears the summary", () => {
    useSignalStore.getState().setSummary({
      sessions: { a: "running" },
      idle: 0,
      running: 1,
      failed: 0,
      success: 0,
      total: 1,
    });
    useSignalStore.getState().reset();
    expect(useSignalStore.getState().summary.total).toBe(0);
  });
});
