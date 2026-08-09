// 挂件窗口行为（独立版）：
//   - 启动默认展开态（不恢复上次的吸附态）
//   - 完整记忆：展开位置（拖动时记录）+ 吸附位置（snap-y）
//   - 收起/展开双态：真实窗口几何切换（窄条 46×228 / 展开 280×400）
//   - 吸附态拖动松手后自动贴回右缘（保留用户停放高度）
//   - 拖拽（header data-tauri-drag-region）、右下角调大小手柄
//
// 所有 Tauri 调用都以 `isTauri` 守卫，web 预览/测试下为 no-op。

import { useCallback, useEffect, useRef, useState } from "react";
import { DOCK_COMPACT_WIDTH } from "@/lib/dock-geometry";
import type { Monitor } from "@/lib/tauri-window";
import { getCurrentWindow, LogicalPosition, LogicalSize, primaryMonitor } from "@/lib/tauri-window";

export const DOCK_FULL_WIDTH = 280;
export const DOCK_FULL_HEIGHT = 400;
/** 窄条高度：4 灯竖排 + 展开按钮 ≈ 206px，248 给足呼吸空间（边缘不紧凑）。 */
export const DOCK_COMPACT_HEIGHT = 248;

// 持久化键 — 独立 app 自己的命名空间。
const DOCK_COMPACT_KEY = "workboard-dock.compact";
/** 展开态窗口位置（拖动时持续记录，启动时恢复）。 */
const DOCK_POS_KEY = "workboard-dock.pos";
/** 吸附窄条记住的 Y（用户可停放在任意高度）。 */
const DOCK_SNAP_Y_KEY = "workboard-dock.snap-y";

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * React hook wiring the dock's window behavior.
 * - 启动总是展开态（compact 初始 false）
 * - 展开态拖动实时记忆窗口位置（DOCK_POS_KEY）
 * - 收起 → 窄条贴右缘，Y 取记忆的 snap-y（首次取展开窗口垂直换算）
 * - 展开 → 回到记忆的展开位置
 * - 吸附态拖动松手 → 300ms debounce 后贴回右缘（保持用户停放 Y）
 */
export function useDockWindowBehavior(): {
  compact: boolean;
  setCompact: (v: boolean) => void;
  startResize: (e: React.MouseEvent) => void;
  isTauri: boolean;
} {
  // 启动默认展开态 —— 不读 storage 恢复吸附态。
  const [compact, setCompactState] = useState(false);
  const isTauri = useRef(
    typeof (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !== "undefined",
  ).current;
  // 展开态位置记忆（收起前快照 + 展开态拖动持续记录）。
  const expandedPosRef = useRef<{ x: number; y: number } | null>(
    readStored<{ x: number; y: number } | null>(DOCK_POS_KEY, null),
  );
  // 吸附窄条记住的 Y。
  const snapYRef = useRef<number | null>(readStored<number | null>(DOCK_SNAP_Y_KEY, null));

  // Apply the real window geometry for a compact/expanded transition.
  const applyGeometry = useCallback(
    (toCompact: boolean) => {
      if (!isTauri) return;
      const win = getCurrentWindow();
      void (async () => {
        const monitor: Monitor | null = await primaryMonitor().catch(() => null);
        const scale = monitor?.scaleFactor ?? 1;
        const logicalW = monitor ? Math.round(monitor.size.width / scale) : window.screen.width;
        const logicalH = monitor ? Math.round(monitor.size.height / scale) : window.screen.height;

        if (toCompact) {
          // 收起前快照展开位置（展开时恢复用）。
          const cur = await win.outerPosition().catch(() => null);
          if (cur) {
            expandedPosRef.current = {
              x: Math.round(cur.x / scale),
              y: Math.round(cur.y / scale),
            };
            writeStored(DOCK_POS_KEY, expandedPosRef.current);
            // 窄条 Y：首次收起 = 展开窗口中心换算；之后沿用记忆的 snap-y。
            if (snapYRef.current === null) {
              snapYRef.current = Math.max(
                0,
                Math.round(cur.y / scale) + (DOCK_FULL_HEIGHT - DOCK_COMPACT_HEIGHT) / 2,
              );
              writeStored(DOCK_SNAP_Y_KEY, snapYRef.current);
            }
          }
          writeStored(DOCK_COMPACT_KEY, true);
          // 窄条固定尺寸：吸附态禁调大小。
          await win.setResizable(false).catch(() => {});
          const y =
            snapYRef.current ?? Math.max(0, Math.round((logicalH - DOCK_COMPACT_HEIGHT) / 2));
          await win.setSize(new LogicalSize(DOCK_COMPACT_WIDTH, DOCK_COMPACT_HEIGHT));
          await win.setPosition(new LogicalPosition(logicalW - DOCK_COMPACT_WIDTH, y));
        } else {
          // 展开回到记忆位置（fallback：右缘垂直居中）。
          const y = Math.max(0, Math.round((logicalH - DOCK_FULL_HEIGHT) / 2));
          const target = expandedPosRef.current ?? {
            x: logicalW - DOCK_FULL_WIDTH,
            y,
          };
          await win.setSize(new LogicalSize(DOCK_FULL_WIDTH, DOCK_FULL_HEIGHT));
          await win.setPosition(new LogicalPosition(target.x, target.y));
          writeStored(DOCK_COMPACT_KEY, false);
          // 恢复可调大小。
          await win.setResizable(true).catch(() => {});
        }
      })().catch(() => {
        /* geometry failure — ignore */
      });
    },
    [isTauri],
  );

  const setCompact = useCallback(
    (v: boolean) => {
      setCompactState(v);
      compactRef.current = v;
      applyGeometry(v);
    },
    [applyGeometry],
  );

  // 启动恢复：窗口从配置尺寸开始，应用记忆的展开位置（若无记忆则保持
  // Rust setup 的默认右缘垂直居中）。只跑一次（ref 守卫，biome lint）。
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!isTauri || restoredRef.current) return;
    restoredRef.current = true;
    const win = getCurrentWindow();
    if (expandedPosRef.current) {
      void win
        .setPosition(new LogicalPosition(expandedPosRef.current.x, expandedPosRef.current.y))
        .catch(() => {});
    }
  }, [isTauri]);

  // 吸附态保持贴边：拖动窄条松手（300ms 无移动）后贴回右缘，Y 保留用户
  // 停放位置。展开态自由拖动（不吸附）。
  const compactRef = useRef(compact);
  compactRef.current = compact;
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    // 程序 setPosition 会触发 onMoved —— 600ms 冷却防止递归贴边。
    let suppressUntil = 0;
    void win
      .onMoved(async () => {
        if (Date.now() < suppressUntil) return;
        if (compactRef.current) {
          // 吸附态：松手后贴回右缘。
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(async () => {
            suppressUntil = Date.now() + 600;
            const monitor: Monitor | null = await primaryMonitor().catch(() => null);
            const scale = monitor?.scaleFactor ?? 1;
            const logicalW = monitor ? Math.round(monitor.size.width / scale) : window.screen.width;
            const cur = await win.outerPosition().catch(() => null);
            if (cur) {
              snapYRef.current = Math.round(cur.y / scale);
              writeStored(DOCK_SNAP_Y_KEY, snapYRef.current);
            }
            await win
              .setPosition(
                new LogicalPosition(logicalW - DOCK_COMPACT_WIDTH, snapYRef.current ?? 0),
              )
              .catch(() => {});
          }, 300);
        } else {
          // 展开态：实时记录窗口位置（记忆"上次窗口所在位置"）。
          const monitor: Monitor | null = await primaryMonitor().catch(() => null);
          const scale = monitor?.scaleFactor ?? 1;
          const cur = await win.outerPosition().catch(() => null);
          if (cur) {
            expandedPosRef.current = {
              x: Math.round(cur.x / scale),
              y: Math.round(cur.y / scale),
            };
            writeStored(DOCK_POS_KEY, expandedPosRef.current);
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [isTauri]);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      if (!isTauri) return;
      e.preventDefault();
      e.stopPropagation();
      void getCurrentWindow().startResizeDragging("SouthEast");
    },
    [isTauri],
  );

  return { compact, setCompact, startResize, isTauri };
}
