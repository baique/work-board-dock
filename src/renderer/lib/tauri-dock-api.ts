// 置底模式 API — 置顶/置底切换（Windows z-order）。
import { invoke } from "@tauri-apps/api/core";
import { isTauriContext } from "./tauri-runtime";

/**
 * 切换置底模式。`true` = 去置顶（普通窗口可覆盖，常驻桌面）；`false` = 恢复
 * 置顶。置底是会话级状态，不持久化：窗口启动时总是置顶（tauri.conf
 * alwaysOnTop: true），UI 初始状态与之保持一致。
 * 返回新状态；失败时返回原状态（调用方回滚 UI）。
 */
export async function setDesktopDock(enabled: boolean): Promise<boolean> {
  if (!isTauriContext()) {
    // 非 Tauri（web 预览）：无真实窗口，直接采纳请求状态。
    return enabled;
  }
  try {
    await invoke("set_desktop_dock", { enabled });
    return enabled;
  } catch (err) {
    console.error("set_desktop_dock failed:", err);
    return !enabled;
  }
}
