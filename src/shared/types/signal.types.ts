// Signal light (红绿灯) shared types — used by both the Rust backend
// (src-tauri/src/signal.rs) and the React renderer.

/** Session lifecycle states for the four-counter display. */
export type SignalState = "idle" | "running" | "failed" | "success";

/** Notification tier: `none` = light-only, `info` = green card (final success),
 * `alert` = red card (failed / awaiting permission). */
export type SignalLevel = "none" | "info" | "alert";

/** A single session's reported status (POST /api/signal). */
export interface SignalPayload {
  session: string;
  state: SignalState;
  msg?: string;
  /** Popup tier; defaults to `none` (light-only) when omitted. */
  level?: SignalLevel;
}

/** What changed in one store mutation — the renderer shows a popup card
 * ("which task, which light") without diffing full summaries. */
export interface SignalChange {
  session: string;
  state: SignalState;
  level: SignalLevel;
  /** true when the session was removed (session closed / TTL reaped). */
  removed: boolean;
}

/** Derived per-state aggregate returned by get_signal_summary / pushed events. */
export interface SignalSummary {
  sessions: Record<string, SignalState>;
  idle: number;
  running: number;
  failed: number;
  success: number;
  total: number;
}

/** Tauri event name pushed by the backend after every store mutation. */
export const SIGNAL_UPDATE_EVENT = "signal-updated";

/** Event payload pushed to the renderer: fresh summary + what changed. */
export interface SignalUpdateEvent {
  summary: SignalSummary;
  lastChange?: SignalChange | null;
}
