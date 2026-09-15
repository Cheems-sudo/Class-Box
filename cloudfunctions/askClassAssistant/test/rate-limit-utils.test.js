const test = require("node:test");
const assert = require("node:assert/strict");
const {
  consumeGlobalModelQuota,
  consumeInitialModelQuota,
  consumeUserQuota,
  defaultGlobalQpmLimit,
  getGlobalQpmLimit,
  isRateLimitReached,
  getMinuteWindow,
  buildRateLimitKey,
  isCounterNotFoundError,
} = require("../rate-limit-utils");
const { getAssistantMinuteLimit } = require("../identity-utils");

const createSerializedCounter = () => {
  let count = 0;
  let queue = Promise.resolve();
  const db = {
    runTransaction(callback) {
      const result = queue.then(() => callback({}));
      queue = result.catch(() => undefined);
      return result;
    },
  };
  return {
    db,
    getCount: () => count,
    readCounter: async () => (count ? { count } : null),
    writeCounter: async () => { count += 1; },
  };
};

const consume = (state, limit) => consumeGlobalModelQuota({
  ...state,
  counter: { id: "global-minute" },
  limit,
});

test("全局 QPM 使用可解释的保守默认值并支持环境变量覆盖", () => {
  assert.equal(defaultGlobalQpmLimit, 5);
  assert.equal(getGlobalQpmLimit(undefined), 5);
  assert.equal(getGlobalQpmLimit("8"), 8);
  assert.equal(getGlobalQpmLimit("0"), 5);
  assert.equal(getGlobalQpmLimit("invalid"), 5);
});

test("普通用户达到 3/min、superAdmin 达到 10/min 时被限制", () => {
  assert.equal(isRateLimitReached(2, getAssistantMinuteLimit("user")), false);
  assert.equal(isRateLimitReached(3, getAssistantMinuteLimit("user")), true);
  assert.equal(isRateLimitReached(9, getAssistantMinuteLimit("superAdmin")), false);
  assert.equal(isRateLimitReached(10, getAssistantMinuteLimit("superAdmin")), true);
});

test("多用户并发只能事务性消费全局 QPM 名额", async () => {
  const state = createSerializedCounter();
  const results = await Promise.all(Array.from({ length: 8 }, () => consume(state, 5)));
  assert.equal(results.filter((result) => result.success).length, 5);
  assert.equal(results.filter((result) => !result.success).length, 3);
  assert.equal(state.getCount(), 5);
});

test("全局限流返回 rate_limit 和指定繁忙提示", async () => {
  const state = createSerializedCounter();
  await consume(state, 1);
  const result = await consume(state, 1);
  assert.deepEqual(result, {
    success: false,
    message: "AI 服务繁忙，请稍后再试",
    errorType: "rate_limit",
    stage: "global_model_rate_limit",
    rateLimitSource: "global_qpm",
    rateLimitKey: "global-minute",
    rateLimitCurrent: 1,
    rateLimitLimit: 1,
    rateLimitWindow: "",
  });
});

test("每次真正的模型 attempt 独立消费额度，未调用模型则不消费", async () => {
  const state = createSerializedCounter();
  assert.equal(state.getCount(), 0, "retrieval_no_match / supplemental 不调用消费函数");
  assert.equal((await consume(state, 2)).success, true, "首次模型调用");
  assert.equal((await consume(state, 2)).success, true, "Retry-After 后的真实重试");
  assert.equal((await consume(state, 2)).success, false, "第三次调用被保护");
  assert.equal(state.getCount(), 2);
});

test("全局 QPM 拒绝时不扣减个人分钟和每日额度", async () => {
  const counts = { global: 1, minute: 0, daily: 0 };
  const db = { runTransaction: (callback) => callback({}) };
  const result = await consumeInitialModelQuota({
    db,
    counters: { global: { id: "global" }, minute: { id: "minute" }, daily: { id: "daily" }, openid: "user" },
    limits: { global: 1, minute: 3, daily: 20 },
    readCounter: async (_transaction, counter) => counts[counter.id] ? { count: counts[counter.id] } : null,
    writeCounter: async (_transaction, counter) => { counts[counter.id] += 1; },
  });
  assert.equal(result.errorType, "rate_limit");
  assert.deepEqual(counts, { global: 1, minute: 0, daily: 0 });
});

test("限流计数读取失败时事务失败关闭且不写入额度", async () => {
  let writes = 0;
  const db = { runTransaction: (callback) => callback({}) };
  await assert.rejects(() => consumeInitialModelQuota({
    db,
    counters: { global: { id: "global" }, minute: { id: "minute" }, daily: { id: "daily" }, openid: "user" },
    limits: { global: 1, minute: 3, daily: 20 },
    readCounter: async () => { throw new Error("database unavailable"); },
    writeCounter: async () => { writes += 1; },
  }), /database unavailable/);
  assert.equal(writes, 0);
});

test("全局 QPM=2 在下一分钟、两分钟和五分钟后使用新 key 并恢复", async () => {
  const records = new Map();
  const db = { runTransaction: (callback) => callback({}) };
  const base = Date.UTC(2026, 8, 15, 11, 1, 10);
  const consumeAt = async (nowMs) => {
    const window = getMinuteWindow(nowMs);
    const counter = {
      id: buildRateLimitKey("class_assistant_ai_global", "global", window.bucketKey),
      bucketKey: window.bucketKey,
      windowLabel: window.label,
    };
    return consumeGlobalModelQuota({
      db, counter, limit: 2,
      readCounter: async (_transaction, value) => records.get(value.id) || null,
      writeCounter: async (_transaction, value, _openid, current) => records.set(value.id, { count: (current && current.count || 0) + 1 }),
    });
  };

  assert.equal((await consumeAt(base)).success, true);
  assert.equal((await consumeAt(base + 1000)).success, true);
  const blocked = await consumeAt(base + 2000);
  assert.equal(blocked.success, false);
  assert.equal(blocked.rateLimitWindow, "20260915T1901");
  assert.equal((await consumeAt(base + 60_000)).success, true);
  assert.equal((await consumeAt(base + 2 * 60_000)).success, true);
  assert.equal((await consumeAt(base + 5 * 60_000)).success, true);
  assert.equal(records.size, 4);
});

test("仅将 SDK 明确的文档不存在错误视为空计数器", () => {
  assert.equal(isCounterNotFoundError(new Error("document.get:fail document with _id counter_1 does not exist")), true);
  assert.equal(isCounterNotFoundError(new Error("database timeout")), false);
});

test("DeepSeek 用户级限流仍同时执行分钟和每日额度", async () => {
  const records = new Map();
  const db = { runTransaction: (callback) => callback({}) };
  const counters = { daily: { id: "daily" }, minute: { id: "minute" }, openid: "user" };
  const run = () => consumeUserQuota({
    db, counters, limits: { daily: 20, minute: 3 },
    readCounter: async (_transaction, counter) => records.get(counter.id) || null,
    writeCounter: async (_transaction, counter, _openid, current) => records.set(counter.id, { count: (current && current.count || 0) + 1 }),
  });
  assert.equal((await run()).success, true);
  assert.equal((await run()).success, true);
  assert.equal((await run()).success, true);
  assert.equal((await run()).errorType, "minute_limit");
  records.set("minute", { count: 0 });
  records.set("daily", { count: 20 });
  assert.equal((await run()).errorType, "daily_limit");
});
