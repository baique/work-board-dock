import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapStateToLevel, type NotificationLevel, notify } from "./notification-service";

describe("notification-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps signal states to notification levels", () => {
    expect(mapStateToLevel("failed")).toBe("high");
    expect(mapStateToLevel("running")).toBe("medium");
    expect(mapStateToLevel("idle")).toBe("low");
    expect(mapStateToLevel("success")).toBe("low");
  });

  it("notify is a no-op (native notifications disabled)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await notify("high", { title: "t", body: "b" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("NotificationLevel type compiles", () => {
    const lvl: NotificationLevel = "medium";
    expect(lvl).toBe("medium");
  });
});
