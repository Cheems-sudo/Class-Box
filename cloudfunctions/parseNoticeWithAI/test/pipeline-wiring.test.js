const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

test("主链只读取 DeepSeek 环境变量且不再初始化 CloudBase AI", () => {
  assert.equal(source.includes('getSafeEnv("DEEPSEEK_API_KEY")'), true);
  assert.equal(source.includes('getSafeEnv("DEEPSEEK_MODEL")'), true);
  assert.equal(source.includes('getSafeEnv("AI_MODEL")'), false);
  assert.equal(source.includes("hy3"), false);
  assert.equal(source.includes("createModel"), false);
  assert.equal(source.includes("generateText"), false);
  assert.equal(source.includes("@cloudbase/node-sdk"), false);
});

test("缺少 API Key 的检查位于用户限流消费之前", () => {
  assert.ok(source.indexOf("if (!aiConfig.apiKey)") < source.indexOf('consumeRateLimit(openid, "parse_notice_ai"'));
});

test("现有 Prompt、输入字段和成功返回结构保持接线", () => {
  assert.equal(source.includes("buildSystemPrompt(getChinaTime(new Date()))"), true);
  assert.equal(source.includes('{ role: "user", content: input }'), true);
  assert.equal(source.includes("success: true,\n      draft"), true);
});
