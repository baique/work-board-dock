import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTodoStore } from "@/stores/todo-store";
import { TodoPanel } from "./TodoPanel";

describe("TodoPanel", () => {
  beforeEach(() => {
    useTodoStore.getState().reset();
  });

  it("adds a todo from input", () => {
    render(<TodoPanel />);
    const input = screen.getByTestId("todo-input");
    fireEvent.change(input, { target: { value: "写周报" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("写周报")).toBeDefined();
  });

  it("removes a todo", () => {
    const id = useTodoStore.getState().addTodo({ title: "待删除", status: "todo" });
    render(<TodoPanel />);
    fireEvent.click(screen.getByTestId(`todo-remove-${id}`));
    expect(useTodoStore.getState().todos).toHaveLength(0);
  });

  it("toggles a todo to done (moves to completed group)", () => {
    const id = useTodoStore.getState().addTodo({ title: "完成我", status: "todo" });
    render(<TodoPanel />);
    fireEvent.click(screen.getByTestId(`todo-toggle-${id}`));
    expect(useTodoStore.getState().todos[0].status).toBe("done");
  });
});
