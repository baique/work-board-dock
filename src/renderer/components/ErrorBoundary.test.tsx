import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb(): React.JSX.Element {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders the fallback UI instead of crashing", () => {
    render(
      <ErrorBoundary context="红绿灯挂件">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("tiptip 出错了")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
    expect(screen.getByText("重试")).toBeTruthy();
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary context="红绿灯挂件">
        <div>正常内容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("正常内容")).toBeTruthy();
  });

  it("recovers after retry", () => {
    render(
      <ErrorBoundary context="红绿灯挂件">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("tiptip 出错了")).toBeTruthy();
  });
});
