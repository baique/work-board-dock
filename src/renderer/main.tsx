// 红绿灯挂件（Signal Dock）— 独立 app 入口
// 单窗口应用：永远只渲染 SignalDock（展开/收起双态）。
// - Tauri 环境：信号经 IPC（get_signal_summary / signal-updated 事件）
// - 浏览器预览：?demo=1 注入演示数据（供 MCP playwright e2e）

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SignalDock from "@/components/workspace/SignalDock";
import "./index.css";


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary context="红绿灯挂件">
      <SignalDock />
    </ErrorBoundary>
  </StrictMode>,
);
