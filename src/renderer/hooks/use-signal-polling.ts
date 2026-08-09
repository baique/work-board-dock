// Real-time signal updates: subscribe to the backend `signal-updated` event
// (pushed after every store mutation by the HTTP endpoint) instead of polling.
// On mount we also fetch the current summary once so the initial state is
// correct even if events fired before the listener was attached.

import type { SignalUpdateEvent } from "@shared/types/signal.types";
import { useEffect } from "react";
import { getSignalSummary, subscribeSignalUpdates } from "@/lib/signal-api";
import { cleanupTauriListener } from "@/lib/tauri-runtime";
import { useSignalStore } from "@/stores/signal-store";

export function useSignalPolling(_intervalMs?: number): void {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    const applyUpdate = (update: SignalUpdateEvent): void => {
      if (cancelled) return;
      useSignalStore.getState().applyUpdate(update.summary, update.lastChange ?? null);
    };

    // Initial sync: pull current state once on mount (covers events that fired
    // before this listener attached, e.g. app boot with pi already running).
    void getSignalSummary().then((summary) => {
      if (!cancelled) useSignalStore.getState().setSummary(summary);
    });

    void subscribeSignalUpdates((update) => {
      applyUpdate(update);
    }).then((dispose) => {
      if (cancelled) dispose();
      else unlisten = dispose;
    });

    return () => {
      cancelled = true;
      cleanupTauriListener(unlisten);
    };
  }, []);
}
