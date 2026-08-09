#!/usr/bin/env bash
# 红绿灯挂件 e2e 验证（MCP playwright 方案）：
#   1. 起 web 预览（5174，?demo=1 注入演示数据）
#   2. 人工用 MCP playwright 打开 http://localhost:5174/?demo=1 逐项验证
#
# 用法：bash .agent/script/browser_automation/dock-e2e.sh
# 前置：MCP playwright 已连接；验证清单见下方 echo。

set -e
cd "$(dirname "$0")/../../.."

export PATH="$HOME/.bun/bin:$PATH"

# 起 dev server（若未在跑）
if ! curl -s -o /dev/null http://localhost:5174/ 2>/dev/null; then
  tmux kill-session -t dockdev 2>/dev/null || true
  tmux new-session -d -s dockdev "cd $PWD && bunx vite --config vite.config.tauri.ts --port 5174"
  sleep 3
fi

echo "✔ dev server: http://localhost:5174/?demo=1"
echo ""
echo "用 MCP playwright 验证："
echo "  1. playwright_browser_navigate http://localhost:5174/?demo=1"
echo "  2. 快照：红绿灯 header(count 4) + 四计数 + alert 弹卡 + 分组列表 + 待办区 + footer"
echo "  3. 收起按钮 → 窄条四灯竖排 + 展开按钮"
echo "  4. 展开按钮 → 恢复完整面板"
echo "  5. todo-input 输入回车 → 待办 · 1 出现"
echo ""
echo "页面正确性通过后：cd src-tauri && cargo test signal::（19 个 Rust 测试）"
