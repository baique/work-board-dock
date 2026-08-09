import type { SignalChange, SignalSummary } from "@shared/types/signal.types";
import { create } from "zustand";

/** Four persistent counters (idle / running / failed / success). Total = open pi sessions. */
interface SignalStateShape {
  summary: SignalSummary;
  /** The last mutation (what changed), for popup cards. */
  lastChange: SignalChange | null;
  setSummary: (summary: SignalSummary) => void;
  applyUpdate: (summary: SignalSummary, lastChange: SignalChange | null) => void;
  reset: () => void;
}

const EMPTY: SignalSummary = { sessions: {}, idle: 0, running: 0, failed: 0, success: 0, total: 0 };

export const useSignalStore = create<SignalStateShape>((set) => ({
  summary: EMPTY,
  lastChange: null,
  // Full-summary replace (used by the pushed `signal-updated` event and initial sync).
  setSummary: (summary) => set({ summary }),
  // Update summary + record what changed (for popup cards).
  applyUpdate: (summary, lastChange) => set({ summary, lastChange }),
  reset: () => set({ summary: EMPTY, lastChange: null }),
}));
