const test = require("node:test");
const assert = require("node:assert/strict");
const {
  consumeUserQuota,
  isRateLimitReached,
  getMinuteWindow,
  buildRateLimitKey,
  isCounterNotFoundError,
} = require("../rate-limit-utils");
const { getAssistantMinuteLimit, getAssistantDailyLimit, isAssistantUserRateLimitExempt } = require("../identity-utils");

test("普通用户达到 10/min 时被限制，superAdmin 用户级额度无限", () => {
  assert.equal(isRateLimitReached(9, getAssistantMinuteLimit("user")), false);
  assert.equal(isRateLimitReached(10, getAssistantMinuteLimit("user")), true);
  assert.equal(isRateLimitReached(1000, getAssistantMinuteLimit("superAdmin")), false);
});

test("仅将 SDK 明确的文档不存在错误视为空计数器", () => {
  assert.equal(isCounterNotFoundError(new Error("document.get:fail document with _id counter_1 does not exist")), true);
  assert.equal(isCounterNotFoundError(new Error("database timeout")), false);
});

test("用户限流计数读取失败时事务失败关闭且不写入额度", async () => {
  let writes = 0;
  const db = { runTransaction: (callback) => callback({}) };
  await assert.rejects(() => consumeUserQuota({
    db,
    counters: { minute: { id: "minute" }, daily: { id: "daily" }, openid: "user" },
    limits: { minute: 10, daily: 100 },
    readCounter: async () => { throw new Error("database unavailable"); },
    writeCounter: async () => { writes += 1; },
  }), /database unavailable/);
  assert.equal(writes, 0);
});

test("普通用户第10次通过，第11次触发分钟限流", async () => {
  const records = new Map();
  const db = { runTransaction: (callback) => callback({}) };
  const counters = { daily: { id: "daily" }, minute: { id: "minute" }, openid: "user" };
  const run = () => consumeUserQuota({
    db, counters, limits: { daily: getAssistantDailyLimit("user"), minute: getAssistantMinuteLimit("user") },
    readCounter: async (_transaction, counter) => records.get(counter.id) || null,
    writeCounter: async (_transaction, counter, _openid, current) => records.set(counter.id, { count: (current && current.count || 0) + 1 }),
  });
  for (let index = 0; index < 10; index += 1) assert.equal((await run()).success, true);
  assert.equal((await run()).errorType, "minute_limit");
});

test("普通用户并发请求仍只能有10次通过分钟限流事务", async () => {
  const records = new Map();
  let queue = Promise.resolve();
  const db = {
    runTransaction(callback) {
      const result = queue.then(() => callback({}));
      queue = result.catch(() => undefined);
      return result;
    },
  };
  const options = {
    db,
    counters: { daily: { id: "daily" }, minute: { id: "minute" }, openid: "user" },
    limits: { daily: 100, minute: 10 },
    readCounter: async (_transaction, counter) => records.get(counter.id) || null,
    writeCounter: async (_transaction, counter, _openid, current) => records.set(counter.id, { count: (current && current.count || 0) + 1 }),
  };
  const results = await Promise.all(Array.from({ length: 11 }, () => consumeUserQuota(options)));
  assert.equal(results.filter((result) => result.success).length, 10);
  assert.equal(results.filter((result) => result.errorType === "minute_limit").length, 1);
});

test("普通用户第100次通过，第101次触发每日限流", async () => {
  const records = new Map([["daily", { count: 99 }]]);
  const db = { runTransaction: (callback) => callback({}) };
  const counters = { daily: { id: "daily" }, minute: { id: "minute" }, openid: "user" };
  const run = () => consumeUserQuota({
    db, counters, limits: { daily: 100, minute: 10 },
    readCounter: async (_transaction, counter) => records.get(counter.id) || null,
    writeCounter: async (_transaction, counter, _openid, current) => records.set(counter.id, { count: (current && current.count || 0) + 1 }),
  });
  assert.equal((await run()).success, true);
  records.set("minute", { count: 0 });
  assert.equal((await run()).errorType, "daily_limit");
});

test("superAdmin 超过10次和100次仍通过且不创建个人 counter", async () => {
  let transactions = 0;
  let writes = 0;
  const db = { runTransaction: async () => { transactions += 1; throw new Error("should not run"); } };
  for (let index = 0; index < 101; index += 1) {
    const result = await consumeUserQuota({
      db,
      counters: { daily: { id: "daily" }, minute: { id: "minute" }, openid: "super" },
      limits: { daily: Infinity, minute: Infinity },
      bypass: isAssistantUserRateLimitExempt("superAdmin"),
      readCounter: async () => null,
      writeCounter: async () => { writes += 1; },
    });
    assert.equal(result.success, true);
  }
  assert.equal(transactions, 0);
  assert.equal(writes, 0);
});
