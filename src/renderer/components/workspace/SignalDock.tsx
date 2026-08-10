// SignalDock (红绿灯挂件) — a lightweight always-on-top window showing every
// pi session's traffic light. Two modes:
//   expanded — four counters + per-session grouped list (失败>运行中>空闲>完成)
//   compact  — dominant-light dot + count, hover to peek the full list
// Popup cards: alert (failed / awaiting permission) and info (final success)
// slide in from the right edge. alert cards stay until dismissed; info cards
// auto-dismiss after 5s. Clicking a card expands the dock.
//
// Dual-window sync: the backend emits `signal-updated` app-wide; both the main
// window and this dock listen directly (no forwarding). On mount and on focus
// we pull the summary once to cover events fired while hidden.

import type { SignalState, SignalSummary } from "@shared/types/signal.types";
import { ArrowDownToLine, Bell, ChevronLeft, ChevronRight, Pin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TodoPanel } from "@/components/workspace/TodoPanel";
import { useDockWindowBehavior } from "@/hooks/use-dock-window-behavior";
import { useTodoLoad } from "@/hooks/use-todo-load";
import { clearSignal, getSignalSummary, subscribeSignalUpdates } from "@/lib/signal-api";
import { displaySessionName } from "@/lib/signal-mapping";
import { setDesktopDock } from "@/lib/tauri-dock-api";
import { getCurrentWindow } from "@/lib/tauri-window";
import { useSignalStore } from "@/stores/signal-store";

/** Traffic-light dot colors + labels (shared with StatusBar). */
const SIGNAL_DOT: Record<SignalState, string> = {
  idle: "bg-zinc-500 ring-2 ring-white/80",
  running: "bg-amber-400 ring-2 ring-white/80",
  failed: "bg-red-500 ring-2 ring-white/80",
  success: "bg-green-600 ring-2 ring-white/80",
};
/** Off (0-count) dots — same hue, much DARKER (like an unlit traffic light):
 *  bright lit vs dark off. Deep -800/-900 tones so lit colors pop against
 *  them (dark must be dark enough for bright to read as bright). */
const SIGNAL_DIM: Record<SignalState, string> = {
  idle: "bg-zinc-600",
  running: "bg-yellow-800",
  failed: "bg-red-800",
  success: "bg-green-800",
};
const SIGNAL_LABEL: Record<SignalState, string> = {
  idle: "空闲",
  running: "运行中",
  failed: "失败",
  success: "成功",
};
/** Display order: most attention first. */
const SIGNAL_ORDER: SignalState[] = ["failed", "running", "idle", "success"];

/**
 * Dot class for a state, given its count. Count 0 → dimmed (light off);
 * >0 → lit color. Dimmed keeps the state's hue at low saturation.
 */
function dotClass(state: SignalState, count: number): string {
  if (count === 0) return SIGNAL_DIM[state];
  return SIGNAL_DOT[state];
}

/** Marks an element non-draggable inside a `data-tauri-drag-region` strip. */
const titlebarNoDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

export default function SignalDock(): React.JSX.Element {
  const summary = useSignalStore((s) => s.summary);
  const { compact, setCompact, startResize } = useDockWindowBehavior();
  useTodoLoad();
  const [docked, setDocked] = useState(false);
  // 置底仅展开态有意义：置底状态下收起 → 先回置顶（窄条被覆盖找不到）；
  // 展开 → 还原收起前的置底/置顶状态。用 ref 记住收起前的 docked。
  const dockedBeforeCompact = useRef(false);

  const toggleDocked = (): void => {
    void setDesktopDock(!docked).then((next) => {
      setDocked(next);
    });
  };

  // 包装 setCompact：收起时若置底则先回置顶，展开时还原。
  const handleCompact = (v: boolean): void => {
    if (v) {
      // 收起（切窄条）：记住当前 docked；若置底，先回置顶。
      dockedBeforeCompact.current = docked;
      if (docked) {
        void setDesktopDock(false).then((next) => setDocked(next));
      }
    } else {
      // 展开：还原收起前的状态（置底 or 置顶）。
      if (dockedBeforeCompact.current) {
        dockedBeforeCompact.current = false;
        void setDesktopDock(true).then((next) => setDocked(next));
      }
    }
    setCompact(v);
  };
  const prevSessions = useRef<Record<string, SignalState>>({});
  const isTauri = useRef(
    typeof (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !== "undefined",
  ).current;

  // ── Demo mode (?demo=1): seed the store with sample sessions so the dock
  // can be previewed in a plain browser / playwright without a live backend.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    const demo: SignalSummary = {
      sessions: {
        "/home/wa/project/work-board": "running",
        "/home/wa/project/deploy-script": "failed",
        "/home/wa/.agents": "success",
        "/home/wa/project/cleanup": "idle",
      },
      idle: 1,
      running: 1,
      failed: 1,
      success: 1,
      total: 4,
    };
    useSignalStore.getState().setSummary(demo);
  }, []);

  // ── Real-time sync: initial pull + event push + refetch on focus ──
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    // Demo mode (?demo=1): skip the real backend pull so the seeded sample
    // data is not overwritten by an empty initial summary.
    if (new URLSearchParams(window.location.search).get("demo") !== "1") {
      void getSignalSummary().then((s) => {
        if (cancelled) return;
        useSignalStore.getState().setSummary(s);
      });
    }

    void subscribeSignalUpdates((update) => {
      if (cancelled) return;
      useSignalStore.getState().applyUpdate(update.summary, update.lastChange ?? null);
    }).then((dispose) => {
      if (cancelled) dispose();
      else unlisten = dispose;
    });

    // Refetch when the window regains focus (events may have fired while hidden).
    let unlistenFocus: (() => void) | null = null;
    if (isTauri) {
      const win = getCurrentWindow();
      void win
        .onFocusChanged(({ payload }) => {
          if (payload) {
            void getSignalSummary().then((s) => {
              if (!cancelled) useSignalStore.getState().setSummary(s);
            });
          }
        })
        .then((fn) => {
          if (cancelled) fn();
          else unlistenFocus = fn;
        });
    }

    return () => {
      cancelled = true;
      unlisten?.();
      unlistenFocus?.();
    };
  }, [isTauri]);

  // ── Flash animation when a session's state changes (row pulse) ──
  const [flashed, setFlashed] = useState<Record<string, number>>({});
  useEffect(() => {
    const entries = Object.entries(summary.sessions);
    for (const [session, state] of entries) {
      if (prevSessions.current[session] && prevSessions.current[session] !== state) {
        setFlashed((prev) => ({ ...prev, [session]: Date.now() }));
      }
      prevSessions.current[session] = state;
    }
  }, [summary.sessions]);

  // ── Grouped session list (attention order) ──
  const groups = useMemo(() => {
    const byState = new Map<SignalState, string[]>();
    for (const s of SIGNAL_ORDER) byState.set(s, []);
    for (const [session, state] of Object.entries(summary.sessions)) {
      byState.get(state)?.push(session);
    }
    return SIGNAL_ORDER.map((state) => ({
      state,
      count: byState.get(state)?.length ?? 0,
      sessions: byState.get(state) ?? [],
    }));
  }, [summary.sessions]);

  const removeSession = (session: string): void => {
    void clearSignal(session);
    // Optimistic local update: the backend event will confirm shortly after.
    useSignalStore.getState().setSummary({
      ...summary,
      sessions: Object.fromEntries(Object.entries(summary.sessions).filter(([k]) => k !== session)),
      total: Math.max(0, summary.total - 1),
    });
  };

  // ── Compact mode: four lights + counts, click to expand ──
  if (compact) {
    return (
      <>
        <LiquidGlassDefs />
        <div
          className="flex h-screen w-screen flex-col items-center justify-center gap-4 py-1.5 glass glass-highlight select-none"
          data-tauri-drag-region
          data-testid="signal-dock-compact"
        >
          {/* All four lights vertically, so the strip shows every state. */}
          {SIGNAL_ORDER.map((state) => (
            <div
              key={state}
              className="flex flex-col items-center gap-1.5"
              role="group"
              aria-label={SIGNAL_LABEL[state]}
            >
              <div className="relative flex h-5 w-5 justify-center">
                <span
                  className={`absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full ${dotClass(
                    state,
                    summary[state],
                  )}`}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums tracking-wide text-foreground/90">
                {summary[state]}
              </span>
            </div>
          ))}

          {/* Expand control — no-drag so the click is not swallowed by dragging. */}
          <button
            type="button"
            onClick={() => handleCompact(false)}
            className="mt-1 rounded-full p-1.5 text-muted-foreground hover:bg-black/5 hover:text-foreground transition-colors"
            aria-label="展开"
            title="展开tiptip"
            style={titlebarNoDragStyle}
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </>
    );
  }

  // ── Expanded mode ──
  return (
    <>
      <LiquidGlassDefs />
      <div
        className="flex h-screen w-screen flex-col glass glass-highlight text-foreground select-none overflow-hidden"
        data-testid="signal-dock"
      >
        {/* Header (draggable — borderless window) */}
        <div
          className="z-30 flex items-center justify-between px-3 py-2.5 border-b border-black/[0.08]"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-foreground">
            <Bell size={13} className="text-foreground/60" />
            tiptip
            <span className="ml-1 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] tabular-nums tracking-wide text-foreground/70">
              {summary.total}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleDocked}
              className={`rounded p-1 transition-colors ${
                docked
                  ? "bg-amber-500/15 text-amber-700"
                  : "bg-primary/15 text-primary"
              }`}
              aria-label={docked ? "已置底：点击恢复置顶" : "已置顶：点击切换置底"}
              aria-pressed={docked}
              title={docked ? "已置底（桌面小组件）· 点击恢复置顶" : "已置顶（悬浮于所有窗口之上）· 点击切换置底"}
            >
              {docked ? <ArrowDownToLine size={14} /> : <Pin size={14} />}
            </button>
            <button
              type="button"
              onClick={() => handleCompact(true)}
              className="rounded p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground transition-colors"
              aria-label="收起"
              title="收起到窄条（手动）"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Four counters */}
        <div className="grid grid-cols-4 gap-1 px-2 pt-2">
          {SIGNAL_ORDER.map((state) => (
            <div
              key={state}
              className="flex flex-col items-center gap-1 rounded-xl glass-chip glass-highlight px-1 py-1.5 transition-colors hover:bg-black/5"
            >
              <div className="relative flex h-3 w-3 justify-center">
                <span
                  className={`absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${dotClass(
                    state,
                    summary[state],
                  )}`}
                />
              </div>
              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                {summary[state]}
              </span>
              <span className="text-[9px] tracking-wide text-foreground/40">
                {SIGNAL_LABEL[state]}
              </span>
            </div>
          ))}
        </div>

        {/* Session list (grouped by attention order) — top half, scrolls */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-2">
          {groups.map(({ state, count, sessions }) =>
            count === 0 ? null : (
              <div key={state}>
                <div className="flex items-center gap-1.5 px-1 py-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${dotClass(state, count)}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {SIGNAL_LABEL[state]}
                  </span>
                  <span className="text-[10px] tabular-nums text-foreground/40">{count}</span>
                </div>
                <div className="mt-0.5 space-y-px">
                  {sessions.map((session) => {
                    const flashKey = flashed[session];
                    return (
                      <div
                        key={session}
                        className={`group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-black/5 transition-colors ${
                          flashKey ? "animate-pulse" : ""
                        }`}
                        data-testid={`dock-session-${state}`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${SIGNAL_DOT[state]}`} />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                          {displaySessionName(session)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSession(session);
                          }}
                          className="shrink-0 rounded p-0.5 text-foreground/25 opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
                          aria-label={`移除 ${displaySessionName(session)}`}
                          title="移除该会话的灯"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ),
          )}

          {summary.total === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 shadow-[0_0_6px_rgba(0,0,0,0.1)]" />
              <div className="text-xs text-foreground/40">暂无任务</div>
              <div className="text-[10px] text-foreground/30">打开 pi 会话后这里会亮灯</div>
            </div>
          )}
        </div>

        {/* Todo list (bottom half, scrolls independently) */}
        <div className="flex h-[38%] min-h-0 flex-col border-t border-black/[0.08]">
          <div className="flex items-center justify-between px-3 pt-1.5 pb-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              待办事项
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TodoPanel />
          </div>
        </div>

        {/* Footer: hint + resize handle (borderless window needs a manual handle) */}
        <div className="relative border-t border-black/[0.08] px-3 py-1.5 text-[9px] tracking-wide text-foreground/30">
          每行 = 一个 pi 会话 · 收起/展开切换窄条
          <button
            type="button"
            onMouseDown={startResize}
            className="absolute right-1 bottom-1 h-3 w-3 cursor-se-resize text-foreground/25 hover:text-foreground/60 transition-colors"
            aria-label="调整大小"
            title="拖拽调整大小"
          >
            <svg
              viewBox="0 0 8 8"
              className="h-full w-full"
              fill="currentColor"
              role="img"
              aria-label="调整窗口大小"
            >
              <title>调整窗口大小</title>
              <path d="M0 8 L8 0 V1 L1 8 Z" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Liquid Glass SVG 折射滤镜定义。挂在 dock 顶层，供 backdrop-filter
 * url(#lg-refract) 引用（Chromium 支持 SVG backdrop-filter）。
 */
function LiquidGlassDefs(): React.JSX.Element {
  return (
    <svg className="lg-svg-defs" aria-hidden="true">
      <defs>
        <filter
          id="lg-refract"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          {/* 流体噪声 → 折射位移图 */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.004 0.006"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.6 0.2"
            result="disp"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="disp"
            scale="26"
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />
          {/* 折射后的玻璃光斑：柔和高光提升材质感 */}
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" result="sharp" />
          <feBlend in="displaced" in2="sharp" mode="normal" />
        </filter>
      </defs>
    </svg>
  );
}
