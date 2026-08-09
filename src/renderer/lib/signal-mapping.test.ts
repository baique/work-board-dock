import { describe, expect, it } from "vitest";
import { displaySessionName } from "./signal-mapping";

describe("signal-mapping display helpers", () => {
  it("shows last segment of a posix path", () => {
    expect(displaySessionName("/home/wa/project/work-board")).toBe("work-board");
  });

  it("shows last segment of a windows path", () => {
    expect(displaySessionName("C:\\Users\\wa\\agent")).toBe("agent");
  });

  it("passes through plain names", () => {
    expect(displaySessionName("my-session")).toBe("my-session");
  });

  it("falls back for empty session", () => {
    expect(displaySessionName("")).toBe("未知会话");
  });
});
