// 测试说明：验证 ai-utils.test 模块的关键行为与边界条件。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifySdkError,
  extractSdkError,
  isRetryableError,
} = require("../ai-utils");

test("解析 CloudBase SDK 错误码和请求信息", () => {
  const details = extractSdkError({
    message: "AI+ 请求出错，错误码：AI_MODEL_DISABLED",
    statusCode: 404,
    requestId: "trace-1",
  });

  assert.equal(details.code, "AI_MODEL_DISABLED");
  assert.equal(details.statusCode, 404);
  assert.equal(details.requestId, "trace-1");
});

test("区分认证、权限、配置、额度、限流和上游错误", () => {
  assert.equal(classifySdkError({ statusCode: 401 }), "auth");
  assert.equal(classifySdkError({ code: "AI_CHANNEL_NOT_ALLOWED" }), "permission");
  assert.equal(classifySdkError({ code: "AI_MODEL_DISABLED" }), "config");
  assert.equal(classifySdkError({ code: "EXCEED_TOKEN_QUOTA_LIMIT" }), "quota");
  assert.equal(classifySdkError({ statusCode: 429 }), "rate_limit");
  assert.equal(classifySdkError({ statusCode: 503 }), "upstream");
});

test("只重试暂时性错误，不重试确定性错误、超时或取消", () => {
  assert.equal(isRetryableError({ errorType: "rate_limit", statusCode: 429 }), true);
  assert.equal(isRetryableError({ errorType: "upstream", statusCode: 502 }), true);
  assert.equal(isRetryableError({ errorType: "network", code: "ECONNRESET" }), true);
  assert.equal(isRetryableError({ errorType: "auth", statusCode: 401 }), false);
  assert.equal(isRetryableError({ errorType: "permission", statusCode: 403 }), false);
  assert.equal(isRetryableError({ errorType: "timeout", code: "ETIMEDOUT" }), false);
  assert.equal(isRetryableError({ errorType: "cancelled" }), false);
});
