// 云函数说明：封装 ai-utils 相关的服务端校验与数据处理流程。
const transientNetworkCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

const normalizeText = (value) => String(value === undefined || value === null ? "" : value).trim();

const sanitizeErrorMessage = (value) => normalizeText(value)
  .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/ig, "$1[REDACTED]")
  .replace(/((?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*)[^\s,;]+/ig, "$1[REDACTED]")
  .slice(0, 500);

const isRetryableError = (error) => {
  const errorType = normalizeText(error && error.errorType);
  const statusCode = Number(error && error.statusCode) || 0;
  const code = normalizeText(error && error.code).toUpperCase();
  const retryAfterMs = Number(error && error.retryAfterMs) || 0;

  if (["cancelled", "timeout", "quota", "auth", "permission", "config", "format"].includes(errorType)) {
    return false;
  }

  if (errorType === "rate_limit") return retryAfterMs > 0;

  return errorType === "upstream"
    || (errorType === "network" && !code)
    || [429, 500, 502, 503, 504].includes(statusCode)
    || transientNetworkCodes.has(code);
};

const runWithSingleRetry = async (operation, options = {}) => {
  const defaultDelayMs = Math.max(0, Number(options.delayMs) || 500);
  const sleep = typeof options.sleep === "function"
    ? options.sleep
    : (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt === 1 || !isRetryableError(error)) throw error;
      const delayMs = typeof options.getDelayMs === "function"
        ? Math.max(0, Number(options.getDelayMs(error)) || 0)
        : defaultDelayMs;
      if (typeof options.beforeRetry === "function") await options.beforeRetry(error, delayMs);
      await sleep(delayMs);
    }
  }

  throw new Error("unreachable retry state");
};

module.exports = {
  isRetryableError,
  runWithSingleRetry,
  sanitizeErrorMessage,
};
