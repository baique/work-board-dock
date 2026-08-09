# AGENTS.md

红绿灯挂件（workboard-dock）独立仓库，从 work-board 抽离。改动前先读本文件 + `.agent/NOTES.md`。

## 边界

- **只做红绿灯 + 待办**：不加终端/项目/SSH/AC P 相关功能
- **协议不变**：5177 HTTP + level + TTL，pi hook（`~/.pi/agent/extensions/traffic-light.ts`）零改动
- **测试**：本地只做代码通过测试 + 局部 e2e（页面正确性，MCP playwright）；窗口行为（拖拽/吸附/置顶）只能用户 Windows 实测
- **铁律**：`bun run test <path>`（node vitest）；`bun test` 是错的

## 关键文件

- `src-tauri/src/signal.rs` — 信号后端（HTTP + TTL + 事件）
- `src-tauri/src/lib.rs` — 单窗口 + load/save_todos 命令
- `src/renderer/components/workspace/SignalDock.tsx` — 挂件 UI（展开/收起/弹卡）
- `src/renderer/hooks/use-dock-window-behavior.ts` — 窗口行为（记忆/吸附/贴边）
- `src/renderer/lib/dock-geometry.ts` — 几何常量（DOCK_COMPACT_WIDTH=46）

## 已知坑

- **useWindowState 绝不能用**（会把挂件拉成 1200×800 盖住一切）——本仓库已删
- onMoved 程序 setPosition 会递归触发 → 600ms 冷却
- 端口 5177 与 work-board 冲突；5173 被 work-board dev 占用，预览用 5174
- Biome exhaustive-deps 拦空依赖数组 → 用 ref 守卫（见 use-dock-window-behavior）
