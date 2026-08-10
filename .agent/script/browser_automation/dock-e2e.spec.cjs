// TIP挂件 e2e 自动化断言（MCP playwright spec）— v2（修正断言）
// ================================================================
// 单次调用完成全部验证：渲染完整性 + 收起/展开双态 + 待办 CRUD。
// 通过 playwright_browser_run_code_unsafe 执行（code 为 async (page) => {...}）。
//
// 用法（MCP playwright 已连接）：
//   1. 起 dev server：bash .agent/script/browser_automation/dock-e2e.sh
//   2. playwright_browser_navigate http://localhost:5174/?demo=1
//   3. 执行本文件的 code（或经 mcpScript 内联）
//
// 输出：每项 [PASS]/[FAIL] + 汇总。全部 PASS = 页面正确性验证通过。
//
// 注意：
//   - 窄条模式的状态名是 aria-label（role=group），可见文本只有计数数字
//     → 用 getByRole('group', { name }) 断言
//   - 展开态用 innerText 包含断言（不依赖 getByText 的 text-node 解析）

const results = [];
const check = (name, cond) => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'}  ${name}`);
};
const bodyText = async () => await page.evaluate(() => document.body.innerText);

// ── 1. 展开态渲染完整性 ──
await page.waitForTimeout(1200);
let text = await bodyText();
check('展开态 header「TIP」', text.includes('TIP'));
check('header 总数徽标 4', text.includes('\n4\n'));
for (const label of ['失败', '运行中', '空闲', '成功']) {
  check(`四计数「${label}」`, text.includes(label));
}
check('alert 弹卡（deploy-script）', text.includes('deploy-script'));
for (const grp of ['deploy-script', 'work-board', 'cleanup', '.agents']) {
  check(`会话分组行「${grp}」`, text.includes(grp));
}
check('待办区标题「待办事项」', text.includes('待办事项'));
check('待办空态', text.includes('暂无待办'));
check('footer 提示', text.includes('收起/展开切换窄条'));
check('resize 手柄', (await page.getByLabel('调整窗口大小').count()) > 0);

// ── 2. 收起 → 窄条四灯竖排 ──
await page.getByRole('button', { name: '收起' }).click();
await page.waitForTimeout(400);
text = await bodyText();
check('收起后「展开」按钮', (await page.getByRole('button', { name: '展开' }).count()) > 0);
check('窄条无「待办事项」', !text.includes('待办事项'));
check('窄条无「TIP」header', !text.includes('TIP'));
// 窄条状态名是 aria-label（role=group），可见文本只有计数数字
for (const label of ['失败', '运行中', '空闲', '成功']) {
  check(`窄条四灯「${label}」`, (await page.getByRole('group', { name: label }).count()) > 0);
}

// ── 3. 展开恢复 ──
await page.getByRole('button', { name: '展开' }).click();
await page.waitForTimeout(400);
text = await bodyText();
check('展开恢复「TIP」header', text.includes('TIP'));
check('展开恢复「待办事项」', text.includes('待办事项'));

// ── 4. 待办 CRUD ──
const todoTitle = `e2e待办${Date.now() % 1000}`;
await page.getByTestId('todo-input').fill(todoTitle);
await page.getByTestId('todo-input').press('Enter');
await page.waitForTimeout(300);
text = await bodyText();
check('待办添加（待办 · 1）', text.includes('待办 · 1'));
check(`新待办「${todoTitle}」`, text.includes(todoTitle));

await page.getByRole('button', { name: '标记完成' }).click();
await page.waitForTimeout(300);
text = await bodyText();
check('标记完成（已完成 · 1）', text.includes('已完成 · 1'));

await page.getByRole('button', { name: '删除' }).click();
await page.waitForTimeout(300);
text = await bodyText();
check('删除后空态', text.includes('暂无待办'));

// ── 汇总 ──
const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`===== e2e 汇总：${results.length} 项断言，${failed.length} 失败 =====`);
return { total: results.length, failed: failed.length, failures: failed.map((f) => f.name) };
