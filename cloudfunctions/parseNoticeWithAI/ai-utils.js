const transientNetworkCodes = new Set([
  "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETDOWN", "ENETUNREACH", "EPIPE", "ETIMEDOUT",
]);

const sanitizeErrorMessage = (value) => String(value === undefined || value === null ? "" : value).trim()
  .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/ig, "$1[REDACTED]")
  .replace(/((?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*)[^\s,;]+/ig, "$1[REDACTED]")
  .slice(0, 500);

const isRetryableError = (error) => {
  const errorType = String(error && error.errorType || "").trim();
  const statusCode = Number(error && error.statusCode) || 0;
  const code = String(error && error.code || "").trim().toUpperCase();
  if (["cancelled", "timeout", "quota", "auth", "permission", "config", "format", "rate_limit"].includes(errorType)) return false;
  return errorType === "upstream"
    || (errorType === "network" && !code)
    || [500, 502, 503, 504].includes(statusCode)
    || transientNetworkCodes.has(code);
};

const runWithSingleRetry = async (operation, options = {}) => {
  const delayMs = Math.max(0, Number(options.delayMs) || 500);
  const sleep = typeof options.sleep === "function"
    ? options.sleep
    : (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt === 1 || !isRetryableError(error)) throw error;
      await sleep(delayMs);
    }
  }
  throw new Error("unreachable retry state");
};

module.exports = { isRetryableError, runWithSingleRetry, sanitizeErrorMessage };
