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

const extractRetryAfterMs = (source, nested) => {
  const headers = source.headers || source.response && source.response.headers || nested.headers || {};
  const raw = typeof headers.get === "function"
    ? headers.get("retry-after")
    : headers["retry-after"] || headers["Retry-After"] || source.retryAfter || nested.retryAfter;
  if (raw === undefined || raw === null || raw === "") return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const retryAt = Date.parse(String(raw));
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : 0;
};

const extractSdkError = (error) => {
  const source = error && typeof error === "object" ? error : {};
  const nested = source.error && typeof source.error === "object" ? source.error : {};
  const message = normalizeText(source.message || nested.message || error);
  const codeMatch = message.match(/(?:错误码|error code)[：:\s]+([A-Z0-9_-]+)/i);

  return {
    code: normalizeText(source.code || source.errCode || nested.code || codeMatch && codeMatch[1]),
    type: normalizeText(source.type || nested.type),
    statusCode: Number(source.statusCode || source.status || nested.statusCode) || 0,
    requestId: normalizeText(source.requestId || source.request_id || nested.requestId),
    message: sanitizeErrorMessage(message),
    retryAfterMs: extractRetryAfterMs(source, nested),
  };
};

const classifySdkError = (details = {}) => {
  const status = Number(details.statusCode) || 0;
  const haystack = `${details.code || ""} ${details.type || ""} ${details.message || ""}`.toLowerCase();

  if (status === 401 || haystack.includes("invalid_api_key") || haystack.includes("authentication")) return "auth";
  if (status === 403 || haystack.includes("permission") || haystack.includes("not_allowed")) return "permission";
  if (haystack.includes("token_quota") || haystack.includes("quota") || haystack.includes("balance") || haystack.includes("insufficient")) return "quota";
  if (status === 429 || normalizeText(details.code) === "429"
    || haystack.includes("rate") || haystack.includes("too many requests")
    || haystack.includes("qpm") || haystack.includes("每分钟请求数") || haystack.includes("达到上限")) return "rate_limit";
  if ([500, 502, 503, 504].includes(status) || haystack.includes("unavailable") || haystack.includes("internal error")) return "upstream";
  if (status === 404 || haystack.includes("model_not_found") || haystack.includes("model_disabled") || haystack.includes("config_missing")) return "config";
  if (haystack.includes("timeout") || haystack.includes("timed out")) return "timeout";

  return "network";
};

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
  classifySdkError,
  extractSdkError,
  isRetryableError,
  runWithSingleRetry,
  sanitizeErrorMessage,
};
