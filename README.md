# 红绿灯挂件（workboard-dock）

独立置顶小窗，实时显示 pi 等智能体会话状态（失败 / 运行中 / 空闲 / 成功）+ 待办管理。从 work-board（Termul 二开）抽离，仅保留红绿灯功能，去掉全部终端/项目/SSH 代码。

## 功能

- **红绿灯四态**：`idle` / `running` / `failed` / `success` 计数 + 会话分组列表
- **分级弹卡**：`alert`（失败/待授权）红卡常驻、`info`（完成）绿卡 5s 自动消失，从右侧滑入
- **双态窗口**：展开（280×400，四计数 + 会话列表 + 待办）⇄ 窄条（46×210，四灯竖排）
- **完整记忆**：展开位置（拖动实时记录）、吸附位置（snap-y）持久化；**启动默认展开态**
- **吸附行为**：展开态自由拖动；吸附态拖动松手后自动贴回右缘（保留停放高度）
- **待办**：快捷添加 / 标记完成 / 删除，JSON 持久化（app 数据目录）

## 架构

- **后端**：Tauri 2 + `src-tauri/src/signal.rs`（axum HTTP 127.0.0.1:5177 + TTL 30min 回收 + `signal-updated` 事件推送）
- **前端**：React 18 + TS + zustand + framer-motion，单窗口渲染 `SignalDock`
- **协议**（与 work-board 完全一致，pi hook 零改动）：
  - `POST /api/signal` `{ session, state, msg?, level: none|info|alert }`
  - `DELETE /api/signal` `{ session }`
  - 心跳续期 + 60s 扫描 + 30min TTL 回收

## 开发

```bash
bun install
bun run dev:web        # web 预览（?demo=1 注入演示数据）
bun run test           # 前端测试（node vitest，jsdom）
bun run typecheck      # tsc
bunx biome check src/  # lint
cd src-tauri && cargo test signal::   # Rust signal 测试（19 个）
bun run build:tauri    # Windows 打包
```

> 测试铁律：`bun run test <path>`（node vitest）≠ `bun test`（jsdom 不生效）。

## 端口

- 5177：信号 HTTP（与 work-board 冲突，不能同时跑两个 app）
- 5180：tauri dev；5174：web 预览（避免与 work-board 的 5173 冲突）
