const test = require("node:test");
const assert = require("node:assert/strict");
const { requestDeepSeek, parseDeepSeekResponse } = require("../deepseek-client");
const { runWithSingleRetry } = require("../ai-utils");

const response = (statusCode, payload) => ({ statusCode, headers: {}, body: JSON.stringify(payload) });

test("DeepSeek 正常读取事项 JSON 文本且请求协议保持低温非流式", async () => {
  let sent;
  const result = await requestDeepSeek({ apiKey: "secret", model: "deepseek-flash" }, [
    { role: "system", content: "system" }, { role: "user", content: "下周一考试" },
  ], { requestImpl: async (request) => {
    sent = request;
    return response(200, { choices: [{ message: { content: '{"title":"考试"}' } }] });
  } });
  assert.equal(result.text, '{"title":"考试"}');
  const body = JSON.parse(sent.body);
  assert.equal(body.model, "deepseek-flash");
  assert.equal(body.temperature, 0.2);
  assert.equal(body.stream, false);
  assert.deepEqual(body.messages.map((item) => item.role), ["system", "user"]);
});

test("缺少 API Key 时不发请求并归类 config", async () => {
  let calls = 0;
  await assert.rejects(requestDeepSeek({ apiKey: "", model: "deepseek-flash" }, [], {
    requestImpl: async () => { calls += 1; },
  }), (error) => error.errorType === "config");
  assert.equal(calls, 0);
});

for (const [statusCode, errorType] of [[401, "auth"], [402, "quota"], [403, "permission"], [429, "rate_limit"], [500, "upstream"], [503, "upstream"]]) {
  test(`DeepSeek HTTP ${statusCode} 归类 ${errorType}`, () => {
    assert.throws(() => parseDeepSeekResponse(response(statusCode, { error: { message: "failed" } })),
      (error) => error.errorType === errorType);
  });
}

test("timeout 保持 timeout，network 最多重试一次", async () => {
  await assert.rejects(requestDeepSeek({ apiKey: "secret", model: "deepseek-flash" }, [], {
    requestImpl: async () => { throw Object.assign(new Error("timed out"), { errorType: "timeout" }); },
  }), (error) => error.errorType === "timeout");
  let calls = 0;
  const result = await runWithSingleRetry(() => requestDeepSeek({ apiKey: "secret", model: "deepseek-flash" }, [], {
    requestImpl: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
      return response(200, { choices: [{ message: { content: "{}" } }] });
    },
  }), { sleep: async () => {} });
  assert.equal(result.text, "{}");
  assert.equal(calls, 2);
});

test("DeepSeek 5xx 最多重试一次并可在第二次成功", async () => {
  let calls = 0;
  const result = await runWithSingleRetry(() => requestDeepSeek({ apiKey: "secret", model: "deepseek-flash" }, [], {
    requestImpl: async () => {
      calls += 1;
      return calls === 1
        ? response(503, { error: { message: "unavailable" } })
        : response(200, { choices: [{ message: { content: "{}" } }] });
    },
  }), { sleep: async () => {} });
  assert.equal(result.text, "{}");
  assert.equal(calls, 2);
});

test("429、auth、quota、permission、format 和 timeout 不重试", async () => {
  for (const errorType of ["rate_limit", "auth", "quota", "permission", "format", "timeout"]) {
    let calls = 0;
    await assert.rejects(runWithSingleRetry(async () => {
      calls += 1;
      throw Object.assign(new Error(errorType), { errorType });
    }, { sleep: async () => {} }));
    assert.equal(calls, 1, errorType);
  }
});

for (const payload of [{}, { choices: [] }, { choices: [{ message: { content: "" } }] }]) {
  test("空 choices 或空 content 归类 format", () => {
    assert.throws(() => parseDeepSeekResponse(response(200, payload)), (error) => error.errorType === "format");
  });
}

test("非法 DeepSeek JSON 归类 format", () => {
  assert.throws(() => parseDeepSeekResponse({ statusCode: 200, headers: {}, body: "not-json" }),
    (error) => error.errorType === "format");
});

test("请求体不包含 openid、学号、身份或 API Key，异常消息会脱敏 Key", async () => {
  let sent;
  await requestDeepSeek({ apiKey: "top-secret", model: "deepseek-flash" }, [
    { role: "system", content: "prompt" }, { role: "user", content: "考试通知" },
  ], { requestImpl: async (request) => {
    sent = request;
    return response(200, { choices: [{ message: { content: "{}" } }] });
  } });
  assert.equal(sent.body.includes("top-secret"), false);
  assert.equal(/openid|学号|superAdmin/.test(sent.body), false);
  await assert.rejects(requestDeepSeek({ apiKey: "top-secret", model: "deepseek-flash" }, [], {
    requestImpl: async () => { throw new Error("api_key=top-secret"); },
  }), (error) => !error.message.includes("top-secret"));
});
