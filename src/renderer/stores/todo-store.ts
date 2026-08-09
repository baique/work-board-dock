import type { Todo, TodoStatus } from "@shared/types/todo.types";
import { create } from "zustand";
import { saveTodos } from "@/lib/tauri-todo-api";

export type SortedTodo = Todo;

/** Sort by deadline ascending; undefined deadlines go last. */
export function sortTodosByDeadline(todos: SortedTodo[]): SortedTodo[] {
  return [...todos].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  });
}

/** A todo whose deadline has passed (or is today) is overdue. */
export function isOverdue(deadline?: string): boolean {
  if (!deadline) return false;
  const now = new Date();
  const d = new Date(deadline);
  d.setHours(23, 59, 59, 999);
  return d.getTime() < now.getTime();
}

interface TodoInput {
  title: string;
  projectId?: string;
  status?: TodoStatus;
  deadline?: string;
  linkedSessionId?: string;
}

interface TodoState {
  todos: Todo[];
  addTodo: (input: TodoInput) => string;
  removeTodo: (id: string) => void;
  updateTodo: (id: string, patch: Partial<Todo>) => void;
  initTodos: (todos: Todo[]) => void;
  reset: () => void;
}

export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],
  addTodo: (input) => {
    const id = crypto.randomUUID();
    const todo: Todo = {
      id,
      title: input.title,
      projectId: input.projectId,
      status: input.status ?? "todo",
      deadline: input.deadline,
      linkedSessionId: input.linkedSessionId,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ todos: [...s.todos, todo] }));
    void saveTodos(get().todos);
    return id;
  },
  removeTodo: (id) => {
    set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
    void saveTodos(get().todos);
  },
  updateTodo: (id, patch) => {
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
    void saveTodos(get().todos);
  },
  initTodos: (todos) => set({ todos }),
  reset: () => set({ todos: [] }),
}));
