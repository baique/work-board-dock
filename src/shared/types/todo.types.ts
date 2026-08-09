// Todo (待办) shared types.

export type TodoStatus = "todo" | "doing" | "done";

export interface Todo {
  id: string;
  title: string;
  projectId?: string;
  status: TodoStatus;
  deadline?: string;
  linkedSessionId?: string;
  createdAt: string;
}
