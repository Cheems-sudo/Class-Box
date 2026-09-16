const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { formatAssistantMessage } = require("../../../miniprogram/utils/assistant-message-format");

const pageDir = path.resolve(__dirname, "../../../miniprogram/pages/class-assistant");
const wxss = fs.readFileSync(path.join(pageDir, "class-assistant.wxss"), "utf8");
const wxml = fs.readFileSync(path.join(pageDir, "class-assistant.wxml"), "utf8");
const pageSource = fs.readFileSync(path.join(pageDir, "class-assistant.js"), "utf8");
const cloudSource = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");

test("班级助手输入栏和消息区均预留 iPhone 底部安全区", () => {
  assert.match(wxss, /input-bar[\s\S]*constant\(safe-area-inset-bottom\)/);
  assert.match(wxss, /input-bar[\s\S]*env\(safe-area-inset-bottom\)/);
  assert.match(wxml, /132rpx\s*\+\s*\{\{keyboardHeight\}\}px[\s\S]*constant\(safe-area-inset-bottom\)/);
  assert.match(wxml, /132rpx\s*\+\s*\{\{keyboardHeight\}\}px[\s\S]*env\(safe-area-inset-bottom\)/);
  assert.match(pageSource, /keyboardHeight:\s*height/);
});

test("粗体和标题 Markdown 标记不会进入最终界面文本", () => {
  const formatted = formatAssistantMessage("### 金额\n国家奖学金是 **10000元**，`每年`发放。");
  assert.equal(formatted, "金额\n国家奖学金是 10000元，每年发放。");
  assert.doesNotMatch(formatted, /\*\*|###|`/);
});

test("Markdown 表格转换为移动端纵向文本", () => {
  const formatted = formatAssistantMessage([
    "| 项目 | 金额 |",
    "| ----- | ------ |",
    "| 国家奖学金 | 10000元 |",
  ].join("\n"));
  assert.equal(formatted, "项目：国家奖学金\n金额：10000元");
  assert.doesNotMatch(formatted, /\||-{3,}/);
});

test("简单列表保持可读换行且 formatter 不生成 HTML", () => {
  const formatted = formatAssistantMessage("- 项目一\n- 项目二\n<script>alert(1)</script>");
  assert.equal(formatted, "- 项目一\n- 项目二\n<script>alert(1)</script>");
  assert.equal(pageSource.includes("rich-text"), false);
  assert.match(pageSource, /formatAssistantMessage\(answer\.content\)/);
  assert.match(pageSource, /const formattedContent = formatAssistantMessage\(answer\.content\)/);
});

test("回答 Prompt 要求单一事实结论前置并禁止 Markdown 表格", () => {
  assert.match(cloudSource, /单一事实问题通常控制在1至3个短段落/);
  assert.match(cloudSource, /第一句直接给出对应数字和单位/);
  assert.match(cloudSource, /问“会怎样”时，先说结果或处分/);
  assert.match(cloudSource, /问“怎么办”时，先给第一步和核心步骤/);
  assert.match(cloudSource, /问“能不能”时，先回答/);
  assert.match(cloudSource, /不要输出Markdown表格/);
  assert.match(cloudSource, /多意图、多条件、处罚分级、完整流程/);
  assert.match(cloudSource, /现行正式标准与旧表、模板或历史口径/);
});
