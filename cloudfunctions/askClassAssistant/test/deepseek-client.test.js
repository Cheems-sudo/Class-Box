const test = require("node:test");
const assert = require("node:assert/strict");
const { requestDeepSeek, parseDeepSeekResponse } = require("../deepseek-client");
const { runWithSingleRetry } = require("../ai-utils");
const { parseModelAnswer } = require("../citation-utils");
const { consumeUserQuota } = require("../rate-limit-utils");
const { isAssistantUserRateLimitExempt } = require("../identity-utils");

const success = (content = "回答\n引用片段：1") => ({
  statusCode: 200, headers: { "x-request-id": "req-1" },
  body: JSON.stringify({ choices: [{ message: { content } }] }),
});

test("DeepSeek 正常响应读取 choices[0].message.content", async () => {
  const result = await requestDeepSeek({ apiKey: "secret", model: "deepseek-flash" }, [{ role: "user", content: "问题" }], { requestImpl: async () => success() });
  assert.equal(result.text, "回答\n引用片段：1");
  assert.equal(result.traceId, "req-1");
});

test("DEEPSEEK_API_KEY 缺失归类 config 且不发请求", async () => {
  let called = false;
  await assert.rejects(() => requestDeepSeek({ apiKey: "", model: "deepseek-flash" }, [], { requestImpl: async () => { called = true; } }), (error) => error.errorType === "config");
  assert.equal(called, false);
});

for (const [statusCode, errorType] of [[401, "auth"], [402, "quota"], [403, "permission"], [429, "rate_limit"], [500, "upstream"], [503, "upstream"]]) {
  test(`DeepSeek HTTP ${statusCode} 归类 ${errorType}`, async () => {
    await assert.rejects(() => requestDeepSeek({ apiKey: "secret", model: "deepseek-flash" }, [], {
      requestImpl: async () => ({ statusCode, headers: {}, body: JSON.stringify({ error: { message: "request failed" } }) }),
    }), (error) => error.errorType === errorType && error.statusCode === statusCode);
  });
}

test("DeepSeek timeout 保持 timeout", async () => {
  await assert.rejects(() => requestDeepSeek({ apiKey: "secret", model: "deepseek-flash" }, [], {
    requestImpl: async () => { throw Object.assign(new Error("timed out"), { errorType: "timeout" }); },
  }), (error) => error.errorType === "timeout");
});

test("DeepSeek 瞬时 network 最多重试一次", async () => {
  let attempts = 0;
  const result = await runWithSingleRetry(() => requestDeepSeek({ apiKey: "secret", model: "deepseek-flash" }, [], {
    requestImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
      return success("成功\n引用片段：1");
    },
  }), { delayMs: 0, sleep: async () => {} });
  assert.equal(result.text.startsWith("成功"), true);
  assert.equal(attempts, 2);
});

for (const response of [
  { statusCode: 200, headers: {}, body: "{}" },
  { statusCode: 200, headers: {}, body: JSON.stringify({ choices: [{ message: { content: "" } }] }) },
  { statusCode: 200, headers: {}, body: "not-json" },
]) {
  test("DeepSeek 空 choices/content 或非法 JSON 归类 format", () => {
    assert.throws(() => parseDeepSeekResponse(response), (error) => error.errorType === "format");
  });
}

test("DeepSeek no_match 和引用协议继续交给 citation-utils", () => {
  const noMatch = parseDeepSeekResponse(success("学生手册中未找到明确规定。"));
  assert.equal(noMatch.text, "学生手册中未找到明确规定。");
  const answer = parseModelAnswer(parseDeepSeekResponse(success()).text, [{ _id: "1", content: "依据。" }]);
  assert.equal(answer.citationValid, true);
});

test("请求体不含 API Key、openid、姓名或学号", async () => {
  let request;
  const apiKey = "ds-private-key";
  await requestDeepSeek({ apiKey, model: "deepseek-flash" }, [{ role: "user", content: "学生手册问题" }], {
    requestImpl: async (value) => { request = value; return success(); },
  });
  assert.equal(request.body.includes(apiKey), false);
  assert.equal(/openid|学号|姓名/.test(request.body), false);
  assert.equal(request.headers.Authorization, `Bearer ${apiKey}`);
  assert.equal(JSON.stringify(new Error("safe")).includes(apiKey), false);
});

test("即使底层错误意外包含 API Key，向上抛出的日志消息也会脱敏", async () => {
  const apiKey = "ds-private-key";
  await assert.rejects(() => requestDeepSeek({ apiKey, model: "deepseek-flash" }, [], {
    requestImpl: async () => { throw new Error(`connection failed ${apiKey}`); },
  }), (error) => !error.message.includes(apiKey) && error.message.includes("[REDACTED]"));
});

test("superAdmin 仅绕过用户额度，DeepSeek 429 仍返回 rate_limit", async () => {
  const bypass = await consumeUserQuota({
    db: { runTransaction: async () => { throw new Error("should not run"); } },
    counters: {}, limits: {}, bypass: isAssistantUserRateLimitExempt("superAdmin"),
    readCounter: async () => null, writeCounter: async () => {},
  });
  assert.equal(bypass.success, true);
  await assert.rejects(() => requestDeepSeek({ apiKey: "secret", model: "deepseek-flash" }, [], {
    requestImpl: async () => ({ statusCode: 429, headers: {}, body: JSON.stringify({ error: { message: "rate limited" } }) }),
  }), (error) => error.errorType === "rate_limit");
});
