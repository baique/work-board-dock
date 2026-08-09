// 置底模式（桌面小组件）API — 把挂件窗口挂到桌面层（Windows）。
import { invoke } from "@tauri-apps/api/core";
import { isTauriContext } from "./tauri-runtime";

const DOCKED_KEY = "workboard-dock.docked";

/** 读取持久化的置底状态（默认 false = 置顶模式）。 */
export function readDockedState(): boolean {
  try {
    return window.localStorage.getItem(DOCKED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeDockedState(v: boolean): void {
  try {
    window.localStorage.setItem(DOCKED_KEY, v ? "true" : "false");
  } catch {
    /* ignore */
  }
}

/**
 * 切换置底模式。`true` = 沉到桌面层（不置顶，常驻桌面）；`false` = 恢复
 * 置顶。Windows 上真贴桌面（SetParent 到 WorkerW），其他平台 no-op。
 * 返回新状态；失败时抛错（调用方降级）。
 */
export async function setDesktopDock(enabled: boolean): Promise<boolean> {
  if (!isTauriContext()) {
    // 非 Tauri（web 预览）：只记状态，不做真实窗口操作。
    writeDockedState(enabled);
    return enabled;
  }
  try {
    await invoke("set_desktop_dock", { enabled });
    writeDockedState(enabled);
    return enabled;
  } catch (err) {
    console.error("set_desktop_dock failed:", err);
    return !enabled;
  }
}
