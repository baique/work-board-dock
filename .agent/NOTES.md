# workboard-dock 项目笔记

## 项目定位
独立置顶小窗（红绿灯挂件 + 待办），从 work-board 抽离（2026-08-09）。用户判断红绿灯不依赖终端管理器 → A 方案独立化。保留：信号 HTTP 9087 + 弹卡 + 双态窗口 + 记忆 + 待办。去掉：全部终端/项目/SSH/ACP 代码。

## 关键决策
- **启动默认展开态**：compact 初始恒 false（不恢复上次吸附态）；展开位置/吸附位置单独持久化（workboard-dock.pos / workboard-dock.snap-y）
- **展开态拖动实时记忆位置**（onMoved 展开分支写 DOCK_POS_KEY）——"记住上次窗口所在位置"
- **吸附态贴边保留 Y**：拖动窄条松手 300ms debounce 后贴右缘，y 用用户停放位置
- **待办持久化**：Rust 命令 load_todos/save_todos 直写 app_data_dir/todos.json（不用 tauri-plugin-store）
- **i18n 已彻底移除**：TodoPanel 的 useTranslation 是死代码（t 从未使用），独立版全部硬编码中文

## 协议（独立版端口 9087）
POST/DELETE 127.0.0.1:9087/api/signal；level: none|info|alert；心跳续期 + 60s 扫 + 30min TTL

## 端口
- 9087 信号 HTTP（不常用高位端口，避免冲突）
- 5180 tauri dev；5174 web 预览（5173 被 work-board 占）

## 测试陷阱
- `bun run test <path>`（node vitest）；`bun test` 是错的
- e2e 走 MCP playwright（`?demo=1` 注入演示数据），窗口行为用户 Windows 实测
- ErrorBoundary 测试会打印 React 捕获错误栈（预期输出，测试仍过）

## 抽离过程中的坑
- 复制 work-board 后 .git 是旧仓库历史 → 必须 rm -rf .git 重新 init
- biome --write 会把单引号改双引号（原项目配了单引号），改文件后再跑 biome 会不一致
- icons 用 `npx tauri icon src-tauri/icons/128x128.png` 重新生成（含 icns/ico）
- build.rs 必须精简（原版引用 dist-web 不存在会报错）

## 红绿灯状态语义（2026-08-09 修正）
- **根因**：turn_end 发 success 过早——一轮完成 ≠ 全部完成，工具循环中误显示绿
- **修正**：turn_end 无错只清错误标记（保持黄 running），仅 agent_settled 无错才发绿
- 事件映射：session_start→idle / input·agent_start·turn_start→running / turn_end有错→failed / tool_call block→failed / agent_settled无错→success(绿)·有错→failed
- 时序依据（pi extensions.md）：turn (repeats while LLM calls tools) → agent_end → agent_settled（无重试/压缩/follow-up 后才算真正结束）
