// 测试说明：验证 ai-utils.test 模块的关键行为与边界条件。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isRetryableError,
  runWithSingleRetry,
  sanitizeErrorMessage,
} = require("../ai-utils");

test("只重试暂时性错误，不重试确定性错误、超时或取消", () => {
  assert.equal(isRetryableError({ errorType: "rate_limit", statusCode: 429 }), false);
  assert.equal(isRetryableError({ errorType: "rate_limit", statusCode: 429, retryAfterMs: 2000 }), true);
  assert.equal(isRetryableError({ errorType: "upstream", statusCode: 502 }), true);
  assert.equal(isRetryableError({ errorType: "network", code: "ECONNRESET" }), true);
  assert.equal(isRetryableError({ errorType: "network", code: "" }), true);
  assert.equal(isRetryableError({ errorType: "auth", statusCode: 401 }), false);
  assert.equal(isRetryableError({ errorType: "permission", statusCode: 403 }), false);
  assert.equal(isRetryableError({ errorType: "timeout", code: "ETIMEDOUT" }), false);
  assert.equal(isRetryableError({ errorType: "cancelled" }), false);
});

const retryScenario = async (errors) => {
  let calls = 0;
  const delays = [];
  const result = await runWithSingleRetry(async () => {
    const error = errors[calls];
    calls += 1;
    if (error) throw error;
    return "ok";
  }, {
    delayMs: 500,
    sleep: async (delayMs) => { delays.push(delayMs); },
  });
  return { calls, delays, result };
};

test("第一次 network 失败后重试一次并成功", async () => {
  const result = await retryScenario([{ errorType: "network", code: "" }, null]);
  assert.deepEqual(result, { calls: 2, delays: [500], result: "ok" });
});

test("连续两次 network 失败后返回第二次错误", async () => {
  const secondError = Object.assign(new Error("second"), { errorType: "network" });
  let calls = 0;
  await assert.rejects(runWithSingleRetry(async () => {
    calls += 1;
    throw calls === 1 ? Object.assign(new Error("first"), { errorType: "network" }) : secondError;
  }, { sleep: async () => {} }), (error) => error === secondError);
  assert.equal(calls, 2);
});

for (const errorType of ["auth", "quota"]) {
  test(`${errorType} 错误不重试`, async () => {
    let calls = 0;
    await assert.rejects(runWithSingleRetry(async () => {
      calls += 1;
      throw Object.assign(new Error(errorType), { errorType });
    }, { sleep: async () => {} }));
    assert.equal(calls, 1);
  });
}

test("QPM 429 未提供 Retry-After 时不立即重试", async () => {
  let calls = 0;
  await assert.rejects(runWithSingleRetry(async () => {
    calls += 1;
    throw Object.assign(new Error("QPM limit"), { errorType: "rate_limit", code: "429" });
  }, { sleep: async () => assert.fail("must not sleep") }));
  assert.equal(calls, 1);
});

test("rate_limit 仅在提供 Retry-After 时按其等待后重试", async () => {
  let calls = 0;
  const delays = [];
  const result = await runWithSingleRetry(async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error("rate limit"), { errorType: "rate_limit", retryAfterMs: 2000 });
    return "ok";
  }, {
    getDelayMs: (error) => error.retryAfterMs,
    sleep: async (delayMs) => delays.push(delayMs),
  });
  assert.equal(result, "ok");
  assert.deepEqual(delays, [2000]);
});

test("成功请求不重试也不等待", async () => {
  const result = await retryScenario([null]);
  assert.deepEqual(result, { calls: 1, delays: [], result: "ok" });
});

test("SDK 日志消息会脱敏并限制长度", () => {
  const message = sanitizeErrorMessage(`authorization: Bearer secret-token api_key=top-secret ${"x".repeat(600)}`);
  assert.equal(message.includes("secret-token"), false);
  assert.equal(message.includes("top-secret"), false);
  assert.ok(message.length <= 500);
});
