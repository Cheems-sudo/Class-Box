const https = require("node:https");

const endpoint = "https://api.deepseek.com/chat/completions";

const createError = (message, metadata = {}) => Object.assign(new Error(message), metadata);
const redactSecret = (error, secret) => {
  if (error && secret && typeof error.message === "string") {
    error.message = error.message.split(secret).join("[REDACTED]");
  }
  return error;
};

const sendHttpsRequest = ({ url, headers, body, timeoutMs }) => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    callback(value);
  };
  const request = https.request(url, { method: "POST", headers }, (response) => {
    const chunks = [];
    let size = 0;
    response.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        request.destroy(createError("DeepSeek response too large", { errorType: "format", stage: "deepseek_response" }));
        return;
      }
      chunks.push(chunk);
    });
    response.on("end", () => finish(resolve, {
      statusCode: Number(response.statusCode) || 0,
      headers: response.headers || {},
      body: Buffer.concat(chunks).toString("utf8"),
    }));
  });
  request.setTimeout(timeoutMs, () => request.destroy(createError("DeepSeek request timed out", {
    errorType: "timeout", stage: "deepseek_request",
  })));
  request.on("error", (error) => finish(reject, error));
  request.end(body);
});

const classifyDeepSeekError = (statusCode, message = "") => {
  const status = Number(statusCode) || 0;
  const text = String(message).toLowerCase();
  if (status === 401) return "auth";
  if (status === 402 || /insufficient balance|balance|billing|余额不足|余额/.test(text)) return "quota";
  if (status === 403) return "permission";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream";
  if (status === 400 || status === 422) return "format";
  return status ? "upstream" : "network";
};

const parseDeepSeekResponse = ({ statusCode, headers = {}, body }) => {
  let payload;
  try {
    payload = JSON.parse(String(body || "").trim());
  } catch (error) {
    throw createError("DeepSeek returned invalid JSON", {
      errorType: "format", statusCode, stage: "deepseek_response",
    });
  }
  const requestId = String(headers["x-request-id"] || headers["X-Request-Id"] || payload.id || "");
  if (statusCode < 200 || statusCode >= 300) {
    const message = String(payload.error && payload.error.message || `DeepSeek HTTP ${statusCode}`);
    throw createError(message, {
      errorType: classifyDeepSeekError(statusCode, message), statusCode,
      code: String(payload.error && payload.error.code || statusCode), requestId,
      stage: "deepseek_response",
    });
  }
  const content = payload.choices && payload.choices[0]
    && payload.choices[0].message && payload.choices[0].message.content;
  if (typeof content !== "string" || !content.trim()) {
    throw createError("DeepSeek response content missing", {
      errorType: "format", statusCode, requestId, stage: "deepseek_response",
    });
  }
  return { text: content.trim(), traceId: requestId };
};

const requestDeepSeek = async (config, messages, options = {}) => {
  if (!config.apiKey) {
    throw createError("DEEPSEEK_API_KEY is missing", { errorType: "config", stage: "deepseek_config" });
  }
  const body = JSON.stringify({ model: config.model, messages, temperature: 0.2, stream: false });
  const requestImpl = options.requestImpl || sendHttpsRequest;
  let response;
  try {
    response = await requestImpl({
      url: endpoint,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      body,
      timeoutMs: Math.max(1000, Number(options.timeoutMs) || 20000),
    });
  } catch (error) {
    if (error && error.errorType) throw redactSecret(error, config.apiKey);
    throw redactSecret(Object.assign(error instanceof Error ? error : new Error("DeepSeek network request failed"), {
      errorType: "network", code: String(error && error.code || ""), stage: "deepseek_request",
    }), config.apiKey);
  }
  try {
    return parseDeepSeekResponse(response);
  } catch (error) {
    throw redactSecret(error, config.apiKey);
  }
};

module.exports = { classifyDeepSeekError, endpoint, parseDeepSeekResponse, requestDeepSeek };
