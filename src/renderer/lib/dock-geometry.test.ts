import { describe, expect, it } from "vitest";
import { DOCK_COMPACT_WIDTH, detectSnapEdge, snapPosition } from "./dock-geometry";

describe("detectSnapEdge", () => {
  it("returns right when the window is dragged near the right edge", () => {
    // Screen 1920, window 280 wide at x=1630 → right distance = 10 < 48
    expect(detectSnapEdge({ windowX: 1630, windowWidth: 280, screenWidth: 1920 })).toBe("right");
  });

  it("returns left when the window is dragged near the left edge", () => {
    expect(detectSnapEdge({ windowX: 20, windowWidth: 280, screenWidth: 1920 })).toBe("left");
  });

  it("returns null when the window is far from any edge", () => {
    expect(detectSnapEdge({ windowX: 800, windowWidth: 280, screenWidth: 1920 })).toBeNull();
  });

  it("honors a custom threshold", () => {
    // Right distance 20, threshold 10 → no snap
    expect(
      detectSnapEdge({ windowX: 1620, windowWidth: 280, screenWidth: 1920, threshold: 10 }),
    ).toBeNull();
    // Right distance 8, threshold 10 → snap
    expect(
      detectSnapEdge({ windowX: 1632, windowWidth: 280, screenWidth: 1920, threshold: 10 }),
    ).toBe("right");
  });

  it("treats negative right distance (window past edge) as snap", () => {
    expect(detectSnapEdge({ windowX: 1700, windowWidth: 280, screenWidth: 1920 })).toBe("right");
  });
});

describe("snapPosition", () => {
  it("pins compact window to the right edge", () => {
    const x = snapPosition("right", 1920);
    expect(x).toBe(1920 - DOCK_COMPACT_WIDTH);
  });

  it("pins compact window to the left edge", () => {
    expect(snapPosition("left", 1920)).toBe(0);
  });
});
