import type { Todo } from "@shared/types/todo.types";
import { beforeEach, describe, expect, it } from "vitest";
import { isOverdue, type SortedTodo, sortTodosByDeadline, useTodoStore } from "./todo-store";

const mk = (over: Partial<Todo> & { id: string }): Todo => ({
  title: "任务",
  status: "todo",
  createdAt: "2026-08-07T00:00:00Z",
  ...over,
});

describe("todo-store", () => {
  beforeEach(() => {
    useTodoStore.getState().reset();
  });

  it("adds and removes todos", () => {
    const { addTodo, removeTodo } = useTodoStore.getState();
    const id = addTodo({ title: "写周报", status: "todo" });
    expect(useTodoStore.getState().todos).toHaveLength(1);
    removeTodo(id);
    expect(useTodoStore.getState().todos).toHaveLength(0);
  });

  it("updates a todo status", () => {
    const { addTodo, updateTodo } = useTodoStore.getState();
    const id = addTodo({ title: "写周报", status: "todo" });
    updateTodo(id, { status: "doing" });
    expect(useTodoStore.getState().todos[0].status).toBe("doing");
  });

  it("sorts by deadline with undefined deadlines last", () => {
    const todos: SortedTodo[] = [
      mk({ id: "1", title: "a" }),
      mk({ id: "2", title: "b", deadline: "2026-08-10" }),
      mk({ id: "3", title: "c", deadline: "2026-08-08" }),
    ];
    const sorted = sortTodosByDeadline(todos);
    expect(sorted.map((t) => t.id)).toEqual(["3", "2", "1"]);
  });

  it("isOverdue detects past deadlines", () => {
    expect(isOverdue("2020-01-01")).toBe(true);
    expect(isOverdue("2099-01-01")).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });
});
