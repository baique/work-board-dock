import type { Todo } from "@shared/types/todo.types";
import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion";
import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { sortTodosByDeadline, useTodoStore } from "@/stores/todo-store";

const spring = { type: "spring" as const, stiffness: 400, damping: 30 };

function TodoRow({
  todo,
  onToggle,
  onRemove,
}: {
  todo: Todo;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const done = todo.status === "done";
  return (
    <m.div
      data-testid={`todo-${todo.id}`}
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={spring}
      className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
    >
      <button
        type="button"
        onClick={onToggle}
        data-testid={`todo-toggle-${todo.id}`}
        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          done
            ? "border-transparent bg-success text-white"
            : "border-sidebar-border text-transparent hover:border-success/60 hover:text-success/40"
        }`}
        aria-label={done ? "标记未完成" : "标记完成"}
      >
        <Check size={11} strokeWidth={3} />
      </button>

      <span
        className={`min-w-0 flex-1 truncate text-sm transition-colors ${
          done ? "line-through text-muted-foreground" : "text-foreground"
        }`}
      >
        {todo.title}
      </span>

      <button
        type="button"
        onClick={onRemove}
        data-testid={`todo-remove-${todo.id}`}
        className="shrink-0 text-sidebar-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        aria-label="删除"
      >
        <Trash2 size={13} />
      </button>
    </m.div>
  );
}

export function TodoPanel() {
  const todos = useTodoStore((s) => s.todos);
  const addTodo = useTodoStore((s) => s.addTodo);
  const removeTodo = useTodoStore((s) => s.removeTodo);
  const updateTodo = useTodoStore((s) => s.updateTodo);
  const [title, setTitle] = useState("");

  const sorted = sortTodosByDeadline(todos);
  const active = sorted.filter((td) => td.status !== "done");
  const done = sorted.filter((td) => td.status === "done");

  const handleAdd = (): void => {
    if (!title.trim()) return;
    addTodo({ title: title.trim(), status: "todo" });
    setTitle("");
  };

  return (
    <div data-testid="todo-panel" className="flex h-full w-full flex-col">
      {/* 快速添加 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.08]">
        <Plus size={15} className="shrink-0 text-muted-foreground" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="添加待办，回车确认"
          data-testid="todo-input"
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <LazyMotion features={domAnimation}>
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-0.5">
          {active.length === 0 && done.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]">
                <Check size={18} className="text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">暂无待办</p>
              <p className="text-[11px] text-muted-foreground/60">在上方输入，回车添加</p>
            </div>
          )}

          {active.length > 0 && (
            <>
              <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {`待办 · ${active.length}`}
              </div>
              <AnimatePresence>
                {active.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    onToggle={() => updateTodo(todo.id, { status: "done" })}
                    onRemove={() => removeTodo(todo.id)}
                  />
                ))}
              </AnimatePresence>
            </>
          )}

          {done.length > 0 && (
            <>
              <div className="px-2 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
                {`已完成 · ${done.length}`}
              </div>
              <AnimatePresence>
                {done.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    onToggle={() => updateTodo(todo.id, { status: "todo" })}
                    onRemove={() => removeTodo(todo.id)}
                  />
                ))}
              </AnimatePresence>
            </>
          )}
        </div>
      </LazyMotion>
    </div>
  );
}
