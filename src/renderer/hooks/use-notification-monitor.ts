// Watch the pushed signal summary and fire notifications:
//   - work starts (running count transitions 0 → >0) → medium
//   - a session fails (failed count transitions 0 → >0) → high
// Uses the four-state model. Pure event-driven (store updates via push).

import { useEffect, useRef } from "react";
import { notify } from "@/lib/notification-service";
import { useSignalStore } from "@/stores/signal-store";

export function useNotificationMonitor(): void {
  const prevRunning = useRef(0);
  const prevFailed = useRef(0);

  useEffect(
    () =>
      useSignalStore.subscribe((state, prevState) => {
        const { running, failed } = state.summary;
        const prevRunningCount = prevState.summary.running;
        const prevFailedCount = prevState.summary.failed;

        // Fire when a session starts working (running 0 → >0), not repeatedly.
        if (running > 0 && prevRunningCount === 0) {
          void notify("medium", { title: "会话开始工作", body: "有 pi 会话开始处理任务" });
        }

        // Fire when a session fails (failed 0 → >0), not repeatedly.
        if (failed > 0 && prevFailedCount === 0) {
          void notify("high", { title: "会话失败", body: "有 pi 会话出错，需要关注" });
        }

        prevRunning.current = running;
        prevFailed.current = failed;
      }),
    [],
  );
}
