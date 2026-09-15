// 模型级限流工具：每次真正调用模型前，在事务中消费一个全局 QPM 名额。
const defaultGlobalQpmLimit = 5;

const getGlobalQpmLimit = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultGlobalQpmLimit;
};

const isRateLimitReached = (count, limit) => (Number(count) || 0) >= limit;

const getMinuteWindow = (nowMs = Date.now()) => {
  const windowMs = 60 * 1000;
  const startMs = Math.floor(Number(nowMs) / windowMs) * windowMs;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(startMs));
  const value = (type) => parts.find((part) => part.type === type).value;
  return {
    windowMs,
    startMs,
    bucketKey: String(startMs),
    label: `${value("year")}${value("month")}${value("day")}T${value("hour")}${value("minute")}`,
  };
};

const isCounterNotFoundError = (error) => /document with _id .+ does not exist/i.test(
  String(error && error.message || error || ""),
);

const buildRateLimitKey = (action, subject, bucketKey) => {
  const safeSubject = String(subject || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${action}_${safeSubject}_${bucketKey}`;
};

const consumeGlobalModelQuota = async ({
  db,
  counter,
  limit,
  readCounter,
  writeCounter,
}) => db.runTransaction(async (transaction) => {
  const current = await readCounter(transaction, counter);
  const count = Number(current && current.count) || 0;

  if (isRateLimitReached(count, limit)) {
    return {
      success: false,
      message: "AI 服务繁忙，请稍后再试",
      errorType: "rate_limit",
      stage: "global_model_rate_limit",
      rateLimitSource: "global_qpm",
      rateLimitKey: counter.id,
      rateLimitCurrent: count,
      rateLimitLimit: limit,
      rateLimitWindow: counter.windowLabel || counter.bucketKey || "",
    };
  }

  await writeCounter(transaction, counter, "__global_model__", current);
  return { success: true };
});

const consumeInitialModelQuota = async ({
  db,
  counters,
  limits,
  readCounter,
  writeCounter,
}) => db.runTransaction(async (transaction) => {
  const daily = await readCounter(transaction, counters.daily);
  const minute = await readCounter(transaction, counters.minute);
  const global = await readCounter(transaction, counters.global);

  if (isRateLimitReached(Number(global && global.count) || 0, limits.global)) {
    return {
      success: false,
      message: "AI 服务繁忙，请稍后再试",
      errorType: "rate_limit",
      stage: "global_model_rate_limit",
      rateLimitSource: "global_qpm",
      rateLimitKey: counters.global.id,
      rateLimitCurrent: Number(global && global.count) || 0,
      rateLimitLimit: limits.global,
      rateLimitWindow: counters.global.windowLabel || counters.global.bucketKey || "",
    };
  }
  if (isRateLimitReached(Number(daily && daily.count) || 0, limits.daily)) {
    return {
      success: false, message: "今日提问次数已用完，请明天再试。", errorType: "daily_limit",
      rateLimitSource: "user_daily", rateLimitKey: counters.daily.id,
      rateLimitCurrent: Number(daily && daily.count) || 0, rateLimitLimit: limits.daily,
      rateLimitWindow: counters.daily.windowLabel || counters.daily.bucketKey || "",
    };
  }
  if (isRateLimitReached(Number(minute && minute.count) || 0, limits.minute)) {
    return {
      success: false, message: "提问太频繁了，请稍后再试。", errorType: "minute_limit",
      rateLimitSource: "user_minute", rateLimitKey: counters.minute.id,
      rateLimitCurrent: Number(minute && minute.count) || 0, rateLimitLimit: limits.minute,
      rateLimitWindow: counters.minute.windowLabel || counters.minute.bucketKey || "",
    };
  }

  await writeCounter(transaction, counters.global, "__global_model__", global);
  await writeCounter(transaction, counters.daily, counters.openid, daily);
  await writeCounter(transaction, counters.minute, counters.openid, minute);
  return { success: true };
});

const consumeUserQuota = async ({ db, counters, limits, readCounter, writeCounter, bypass = false }) => {
  if (bypass) return { success: true, bypassed: true };
  return db.runTransaction(async (transaction) => {
    const daily = await readCounter(transaction, counters.daily);
    const minute = await readCounter(transaction, counters.minute);
    if (isRateLimitReached(Number(daily && daily.count) || 0, limits.daily)) {
      return {
        success: false, message: "今日提问次数已用完，请明天再试。", errorType: "daily_limit",
        rateLimitSource: "user_daily", rateLimitKey: counters.daily.id,
        rateLimitCurrent: Number(daily && daily.count) || 0, rateLimitLimit: limits.daily,
        rateLimitWindow: counters.daily.windowLabel || counters.daily.bucketKey || "",
      };
    }
    if (isRateLimitReached(Number(minute && minute.count) || 0, limits.minute)) {
      return {
        success: false, message: "提问太频繁了，请稍后再试。", errorType: "minute_limit",
        rateLimitSource: "user_minute", rateLimitKey: counters.minute.id,
        rateLimitCurrent: Number(minute && minute.count) || 0, rateLimitLimit: limits.minute,
        rateLimitWindow: counters.minute.windowLabel || counters.minute.bucketKey || "",
      };
    }
    await writeCounter(transaction, counters.daily, counters.openid, daily);
    await writeCounter(transaction, counters.minute, counters.openid, minute);
    return { success: true };
  });
};

module.exports = {
  consumeGlobalModelQuota,
  consumeInitialModelQuota,
  consumeUserQuota,
  defaultGlobalQpmLimit,
  getGlobalQpmLimit,
  getMinuteWindow,
  buildRateLimitKey,
  isCounterNotFoundError,
  isRateLimitReached,
};
