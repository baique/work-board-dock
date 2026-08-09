// Tauri command facade for the signal light (红绿灯) backend.
// The renderer subscribes to the pushed `signal-updated` event for real-time
// updates; the Rust side owns the always-on HTTP endpoint (127.0.0.1:5177).

import type { SignalChange, SignalSummary, SignalUpdateEvent } from "@shared/types/signal.types";
import { SIGNAL_UPDATE_EVENT } from "@shared/types/signal.types";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriContext } from "./tauri-runtime";

const EMPTY_SUMMARY: SignalSummary = {
  sessions: {},
  idle: 0,
  running: 0,
  failed: 0,
  success: 0,
  total: 0,
};

/** Fetch the derived signal summary (counts + session lists). [] outside Tauri. */
export async function getSignalSummary(): Promise<SignalSummary> {
  if (!isTauriContext()) return EMPTY_SUMMARY;
  try {
    return await invoke<SignalSummary>("get_signal_summary");
  } catch (err) {
    console.error("get_signal_summary failed:", err);
    return EMPTY_SUMMARY;
  }
}

/** Remove a session's signal (e.g. pi session closed / manual dismissal). */
export async function clearSignal(session: string): Promise<void> {
  if (!isTauriContext()) return;
  try {
    await invoke("clear_signal", { session });
  } catch (err) {
    console.error("clear_signal failed:", err);
  }
}

/**
 * Subscribe to real-time signal updates pushed by the backend after every
 * mutation. The callback receives `{ summary, lastChange }` — the renderer
 * renders the fresh summary and may show a popup card for alert/info changes.
 * Resolves to an unlisten function. No-op in the web build.
 */
export async function subscribeSignalUpdates(
  callback: (update: SignalUpdateEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauriContext()) return () => {};
  return listen<SignalUpdateEvent>(SIGNAL_UPDATE_EVENT, (event) => {
    callback(event.payload);
  });
}

/** Type-only helper for consumers that only need the change (popup cards). */
export type { SignalChange };
