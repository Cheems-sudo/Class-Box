const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");

test("retrieval_no_match 在用户限流和 AI 调用之前返回", () => {
  const retrievalGuard = source.indexOf("if (!matchedChunks.length)");
  const userLimit = source.indexOf("consumeAssistantUserRateLimit(openid, actor.role)");
  const aiRequest = source.indexOf("aiResult = await runStage(\"aiMs\"");
  assert.ok(retrievalGuard >= 0);
  assert.ok(userLimit > retrievalGuard);
  assert.ok(aiRequest > userLimit);
});

test("DeepSeek 主链不再消费 AI_GLOBAL_QPM_LIMIT", () => {
  const requestAiStart = source.indexOf("const requestAi = async");
  const requestAiEnd = source.indexOf("const getAiErrorMessage", requestAiStart);
  const requestAiSource = source.slice(requestAiStart, requestAiEnd);
  const invokedIndex = requestAiSource.indexOf("options.onAttempt()");
  const sdkIndex = requestAiSource.indexOf("return requestAiOnce");
  assert.equal(source.includes("AI_GLOBAL_QPM_LIMIT"), false);
  assert.ok(invokedIndex >= 0);
  assert.ok(sdkIndex > invokedIndex);
});

test("直接证据提示不会因引用其他文件而误判 no_match", () => {
  assert.match(source, /片段已经能够直接支持问题的核心关系、条件、流程、标准或结果/);
  assert.match(source, /不得仅因片段引用了另一份管理文件、实施细则或相关规定/);
  assert.match(source, /哪些具体细节在提供的片段中未说明/);
});

test("DeepSeek 调用前仅保留个人分钟和每日额度", () => {
  const retrievalGuard = source.indexOf("if (!matchedChunks.length)");
  const combinedLimit = source.indexOf("consumeAssistantUserRateLimit(openid, actor.role)");
  const modelRequest = source.indexOf("aiResult = await runStage(\"aiMs\"");
  assert.ok(combinedLimit > retrievalGuard);
  assert.ok(modelRequest > combinedLimit);
});

test("检索日志包含版本指纹和脱敏候选诊断", () => {
  assert.match(source, /handbookDataVersion/);
  assert.match(source, /retrievalVersion/);
  assert.match(source, /promptVersion/);
  assert.match(source, /coveredConcepts/);
  assert.match(source, /continuation/);
  assert.match(source, /score/);
  assert.match(source, /aiProvider/);
  assert.match(source, /const aiProvider = "deepseek"/);
});

test("模型配置只读取 DeepSeek 环境变量且缺少 Key 时不进入限流或接口", () => {
  assert.match(source, /DEEPSEEK_API_KEY/);
  assert.match(source, /DEEPSEEK_MODEL/);
  assert.match(source, /deepseek-flash/);
  assert.equal(source.includes('getSafeEnv("AI_MODEL")'), false);
  const missingKey = source.indexOf("if (!aiConfig.apiKey)");
  const userLimit = source.indexOf("consumeAssistantUserRateLimit(openid, actor.role)");
  assert.ok(missingKey >= 0 && userLimit > missingKey);
});
