// 待办持久化 — 走 Rust 命令读写 app 数据目录下的 todos.json。
// （独立版不依赖 tauri-plugin-store，后端 save_todos/load_todos 直写 JSON。）

import type { Todo } from "@shared/types/todo.types";
import { invoke } from "@tauri-apps/api/core";
import { isTauriContext } from "./tauri-runtime";

/** Load persisted todos. Returns [] on any failure (degrade, don't crash). */
export async function loadTodos(): Promise<Todo[]> {
  if (!isTauriContext()) return [];
  try {
    const raw = await invoke<unknown[]>("load_todos");
    return Array.isArray(raw) ? (raw as Todo[]) : [];
  } catch (err) {
    console.error("load_todos failed:", err);
    return [];
  }
}

/** Persist todos. */
export async function saveTodos(todos: Todo[]): Promise<void> {
  if (!isTauriContext()) return;
  try {
    await invoke("save_todos", { todos });
  } catch (err) {
    console.error("save_todos failed:", err);
  }
}
