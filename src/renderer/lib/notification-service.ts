// Unified tiered notification service. Both the signal light (红绿灯) and the
// todo deadline reminders route through here. Levels:
//   low    → silent (in-app status dot only)
//   medium → system toast
//   high   → system toast + (future) topmost popup window
//
// ⚠️ 2026-08-07: Windows 原生通知已禁用（用户反馈烦人），notify() 为 no-op。
// 保留分级接口与调用点结构，待新的优雅通知方案（应用内浮窗/置顶小窗）落地后替换实现。

import type { SignalState } from "@shared/types/signal.types";

// （独立版：不依赖 tauri 通知插件，notify() 保持 no-op。）

export type NotificationLevel = "low" | "medium" | "high";

export interface NotificationPayload {
  title: string;
  body?: string;
}

/** Map a signal state to a notification level. Failed → high (needs attention); running → medium. */
export function mapStateToLevel(state: SignalState): NotificationLevel {
  switch (state) {
    case "failed":
      return "high";
    case "running":
      return "medium";
    default:
      return "low";
  }
}

/**
 * Fire a notification at the given level. `low` is silent (no desktop call).
 * `medium`/`high` both use the desktop notification; `high` additionally
 * escalates to a topmost popup window (implemented in a later task).
 *
 * ⚠️ 原生通知已禁用：当前为 no-op，保留接口待新通知方案实现（应用内浮窗）。
 */
export async function notify(
  level: NotificationLevel,
  payload: NotificationPayload,
): Promise<void> {
  // 原生系统通知已禁用（用户反馈烦人）。新通知方案（应用内优雅浮窗）
  // 落地前，任何级别都不弹系统通知。保留 level/payload 参数供后续实现。
  void level;
  void payload;
  return;
}
