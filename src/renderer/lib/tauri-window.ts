/**
 * Thin Tauri window facade — components/hooks import window APIs from here
 * (Story 1.6 Biome ban), not from `@tauri-apps/api/window` directly.
 */
import { getCurrentWindow as tauriGetCurrentWindow } from "@tauri-apps/api/window";

export {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
  type Monitor,
  primaryMonitor,
} from "@tauri-apps/api/window";

/** Window label of the current window ('' in plain browsers). */
export function getCurrentWindowLabel(): string {
  try {
    return tauriGetCurrentWindow().label;
  } catch {
    return "";
  }
}
