// Load persisted todos once at startup into the todo store.

import { useEffect } from "react";
import { loadTodos } from "@/lib/tauri-todo-api";
import { useTodoStore } from "@/stores/todo-store";

export function useTodoLoad(): void {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const todos = await loadTodos();
        if (!cancelled) useTodoStore.getState().initTodos(todos);
      } catch (err) {
        console.error("todo load error:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
