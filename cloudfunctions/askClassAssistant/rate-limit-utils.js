// 用户级限流工具：按分钟和自然日窗口在事务中消费个人业务额度。
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
  consumeUserQuota,
  getMinuteWindow,
  buildRateLimitKey,
  isCounterNotFoundError,
  isRateLimitReached,
};
