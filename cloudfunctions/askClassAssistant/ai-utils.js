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
    message,
  };
};

const classifySdkError = (details = {}) => {
  const status = Number(details.statusCode) || 0;
  const haystack = `${details.code || ""} ${details.type || ""} ${details.message || ""}`.toLowerCase();

  if (status === 401 || haystack.includes("invalid_api_key") || haystack.includes("authentication")) return "auth";
  if (status === 403 || haystack.includes("permission") || haystack.includes("not_allowed")) return "permission";
  if (haystack.includes("token_quota") || haystack.includes("quota") || haystack.includes("balance") || haystack.includes("insufficient")) return "quota";
  if (status === 429 || haystack.includes("rate") || haystack.includes("too many requests")) return "rate_limit";
  if ([500, 502, 503, 504].includes(status) || haystack.includes("unavailable") || haystack.includes("internal error")) return "upstream";
  if (status === 404 || haystack.includes("model_not_found") || haystack.includes("model_disabled") || haystack.includes("config_missing")) return "config";
  if (haystack.includes("timeout") || haystack.includes("timed out")) return "timeout";

  return "network";
};

const isRetryableError = (error) => {
  const errorType = normalizeText(error && error.errorType);
  const statusCode = Number(error && error.statusCode) || 0;
  const code = normalizeText(error && error.code).toUpperCase();

  if (["cancelled", "timeout", "quota", "auth", "permission", "config", "format"].includes(errorType)) {
    return false;
  }

  return errorType === "rate_limit"
    || errorType === "upstream"
    || [429, 500, 502, 503, 504].includes(statusCode)
    || transientNetworkCodes.has(code);
};

module.exports = {
  classifySdkError,
  extractSdkError,
  isRetryableError,
};
