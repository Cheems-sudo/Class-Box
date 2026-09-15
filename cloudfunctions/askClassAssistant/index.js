// 云函数说明：封装 index 相关的服务端校验与数据处理流程。
const cloud = require("wx-server-sdk");
const crypto = require("node:crypto");
const { runWithSingleRetry, sanitizeErrorMessage } = require("./ai-utils");
const { expandContinuationChunks, rankChunks, retrievalVersion } = require("./retrieval-utils");
const { parseModelAnswer } = require("./citation-utils");
const { expandQuestionAliases, getSupplementalAnswer } = require("./supplemental-answers");
const { requestDeepSeek } = require("./deepseek-client");
const {
  consumeUserQuota,
  getMinuteWindow,
  isCounterNotFoundError,
  buildRateLimitKey,
} = require("./rate-limit-utils");
const {
  getAssistantDailyLimit,
  getAssistantMinuteLimit,
  isRequestOwnedByOther,
  normalizeAssistantRole,
  resolveAssistantIdentity,
} = require("./identity-utils");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const questionMaxLength = 300;
const aiTimeoutMs = 45000;
const totalTimeoutMs = 55000;
const handbookCacheTtlMs = 5 * 60 * 1000;
const maxCandidateChunks = 3000;
const maxMatchedChunks = 5;
const requestIdPattern = /^[a-zA-Z0-9_-]{12,80}$/;
let handbookChunkCache = null;
const noMatchAnswer = "学生手册中未找到明确规定。";
const promptVersion = "handbook-grounded-v3";

const fail = (message, errorType, details = {}) => ({
  success: false,
  message,
  errorType,
  ...details,
});

const normalizeRole = (role) => {
  return normalizeAssistantRole(role);
};

const getErrorCode = (value) => Number(value && (value.errCode !== undefined ? value.errCode : value.errcode));

const logSafeError = (action, error, extra = {}) => {
  console.error(action, {
    type: String(error && (error.sdkType || error.type || error.name) || "Error"),
    code: String(error && (error.code || error.gatewayCode || error.errCode || error.errcode) || ""),
    errorType: String(error && error.errorType || ""),
    statusCode: Number(error && error.statusCode) || 0,
    requestId: String(error && error.requestId || ""),
    retryAfterMs: Number(error && error.retryAfterMs) || 0,
    message: sanitizeErrorMessage(error && error.message),
    stage: String(error && error.stage || extra.stage || ""),
    latencyMs: Number(error && error.latencyMs || extra.latencyMs) || 0,
    model: String(extra.model || ""),
    channel: "deepseek-http",
  });
};

const getSafeEnv = (name) => String(process.env[name] || "").trim();

const getAiConfig = () => {
  const apiKey = getSafeEnv("DEEPSEEK_API_KEY");
  const model = getSafeEnv("DEEPSEEK_MODEL") || "deepseek-flash";
  return { apiKey, model };
};

const getShanghaiDateKey = () => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date()).replace(/\D/g, "");

const buildCounter = (openid, action, bucketKey, windowMs, nowMs = Date.now(), windowLabel = "") => {
  return {
    id: buildRateLimitKey(action, openid, bucketKey),
    action,
    bucketKey,
    windowLabel,
    bucketStart: new Date(Math.floor(Number(nowMs) / windowMs) * windowMs),
    windowMs,
  };
};

const readCounter = async (transaction, counter) => {
  try {
    const result = await transaction.collection("security_counters").doc(counter.id).get();
    return result.data || null;
  } catch (error) {
    if (isCounterNotFoundError(error)) return null;
    throw error;
  }
};

// 记录审计或辅助数据；记录失败不应掩盖主业务结果。
const writeCounter = async (transaction, counter, openid, current) => {
  const now = new Date();
  const data = {
    openid,
    action: counter.action,
    count: (Number(current && current.count) || 0) + 1,
    windowStart: counter.bucketStart,
    windowMs: counter.windowMs,
    updatedAt: now,
    expiresAt: new Date(counter.bucketStart.getTime() + counter.windowMs * 2),
  };

  if (current) {
    await transaction.collection("security_counters").doc(counter.id).update({ data });
    return;
  }

  await transaction.collection("security_counters").doc(counter.id).set({
    data: {
      ...data,
      createdAt: now,
    },
  });
};

const consumeAssistantUserRateLimit = async (openid, role) => {
  const dailyLimit = getAssistantDailyLimit(role);
  const minuteLimit = getAssistantMinuteLimit(role);
  const nowMs = Date.now();
  const minuteWindow = getMinuteWindow(nowMs);
  const dailyKey = getShanghaiDateKey();
  const dailyCounter = buildCounter(openid, "class_assistant_daily", dailyKey, 24 * 60 * 60 * 1000, nowMs, dailyKey);
  const minuteCounter = buildCounter(openid, "class_assistant_minute", minuteWindow.bucketKey, minuteWindow.windowMs, nowMs, minuteWindow.label);
  return consumeUserQuota({
    db,
    counters: { daily: dailyCounter, minute: minuteCounter, openid },
    limits: { daily: dailyLimit, minute: minuteLimit },
    readCounter,
    writeCounter,
  });
};

const isRejectedResult = (result) => {
  const suggest = result && result.result && result.result.suggest;

  return suggest === "risky" || suggest === "review" || getErrorCode(result) === 87014;
};

const buildSecurityError = (message, errorType) => {
  const error = new Error(message);
  error.errorType = errorType;
  return error;
};

// 在后续处理前验证输入和业务约束，失败时立即终止无效流程。
const checkText = async (content, openid) => {
  const text = String(content || "").trim();

  if (!text) {
    return;
  }

  const result = await cloud.openapi.security.msgSecCheck({
    content: text,
    version: 2,
    scene: 2,
    openid,
  });

  if (isRejectedResult(result)) {
    throw buildSecurityError("question rejected", "security_rejected");
  }

  const errCode = getErrorCode(result);

  if (!Number.isNaN(errCode) && errCode !== 0) {
    const error = buildSecurityError("question security check failed", "security_check_failed");
    error.errCode = errCode;
    throw error;
  }
};

// 记录审计或辅助数据；记录失败不应掩盖主业务结果。
const writeUsageLog = async ({ openid, role, userType, handbookVersion, handbookDataVersion, questionLength, matchedChunkIds, matchedChunkSummary, contextLength, noMatchSource, rateLimitSource, rateLimitKey, rateLimitCurrent, rateLimitLimit, rateLimitWindow, aiProvider, outcome, errorType, model, latencyMs, stageLatencies, traceId, aiInvoked, aiSucceeded }) => {
  if (!openid) {
    return;
  }

  try {
    await db.collection("class_assistant_logs").add({
      data: {
        openid,
        role: normalizeRole(role),
        userType: userType === "guest" ? "guest" : (userType === "member" ? "member" : null),
        handbookVersion: String(handbookVersion || ""),
        handbookDataVersion: String(handbookDataVersion || ""),
        retrievalVersion,
        promptVersion,
        questionLength: Number(questionLength) || 0,
        matchedChunkIds: Array.isArray(matchedChunkIds) ? matchedChunkIds : [],
        matchedChunkSummary: Array.isArray(matchedChunkSummary) ? matchedChunkSummary.slice(0, 10) : [],
        contextLength: Number(contextLength) || 0,
        noMatchSource: String(noMatchSource || ""),
        rateLimitSource: String(rateLimitSource || ""),
        rateLimitKey: String(rateLimitKey || "").slice(0, 160),
        rateLimitCurrent: Number(rateLimitCurrent) || 0,
        rateLimitLimit: Number(rateLimitLimit) || 0,
        rateLimitWindow: String(rateLimitWindow || "").slice(0, 32),
        outcome: String(outcome || "ai_failed"),
        errorType: String(errorType || ""),
        model: String(model || ""),
        aiProvider: String(aiProvider || "deepseek"),
        latencyMs: Number(latencyMs) || 0,
        stageLatencies: stageLatencies && typeof stageLatencies === "object" ? stageLatencies : {},
        traceId: String(traceId || ""),
        aiInvoked: aiInvoked === true,
        aiSucceeded: aiSucceeded === true,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logSafeError("askClassAssistant usage log failed", error);
  }
};

// 记录审计或辅助数据；记录失败不应掩盖主业务结果。
const writeUnansweredQuestion = async ({ question, handbookVersion, source }) => {
  const now = new Date();

  try {
    await db.collection("class_assistant_gaps").add({
      data: {
        question: String(question || "").trim(),
        handbookVersion: String(handbookVersion || ""),
        source: String(source || ""),
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  } catch (error) {
    logSafeError("askClassAssistant unanswered question write failed", error, { stage: "gap_log" });
  }
};

const getActiveHandbookVersion = async () => {
  const result = await db.collection("handbook_versions")
    .where({ active: true })
    .limit(2)
    .get();
  const versions = result.data || [];

  if (versions.length > 1) {
    const error = new Error("multiple active handbook versions");
    error.errorType = "config";
    throw error;
  }

  return versions[0] || null;
};

// 读取并整理 fetchHandbookChunks 所需的数据，异步完成后再同步业务状态。
const fetchHandbookChunks = async (handbookVersion) => {
  if (handbookChunkCache
    && handbookChunkCache.handbookVersion === handbookVersion
    && handbookChunkCache.expiresAt > Date.now()) {
    return handbookChunkCache.chunks;
  }

  const chunks = [];
  let page = 0;

  while (chunks.length < maxCandidateChunks) {
    const result = await db.collection("handbook_chunks")
      .where({ handbookVersion })
      .orderBy("sort", "asc")
      .skip(page * 100)
      .limit(100)
      .get();
    const current = result.data || [];

    chunks.push(...current);

    if (current.length < 100) {
      break;
    }

    page += 1;
  }

  if (chunks.length >= maxCandidateChunks) {
    const overflow = await db.collection("handbook_chunks")
      .where({ handbookVersion })
      .orderBy("sort", "asc")
      .skip(maxCandidateChunks)
      .limit(1)
      .get();

    if ((overflow.data || []).length) {
      const error = new Error("handbook chunk limit exceeded");
      error.errorType = "config";
      throw error;
    }
  }

  handbookChunkCache = {
    handbookVersion,
    chunks,
    dataHash: crypto.createHash("sha256").update(chunks.map((chunk) => [
      chunk.sort, chunk.title, chunk.article, chunk.pageText, chunk.content,
    ].join("|")).join("\n")).digest("hex"),
    expiresAt: Date.now() + handbookCacheTtlMs,
  };

  return chunks;
};

const getRequestDoc = (requestId) => db.collection("class_assistant_requests").doc(requestId);

const readRequestState = async (requestId) => {
  try {
    const result = await getRequestDoc(requestId).get();
    return result.data || null;
  } catch (error) {
    return null;
  }
};

// 用请求标识维护异步任务状态，避免旧任务影响当前操作。
const registerRequest = async (requestId, openid) => {
  return db.runTransaction(async (transaction) => {
    let current = null;

    try {
      const result = await transaction.collection("class_assistant_requests").doc(requestId).get();
      current = result.data || null;
    } catch (error) {
      current = null;
    }

    if (current) {
      return current.openid === openid && current.cancelled === true;
    }

    const now = new Date();
    await transaction.collection("class_assistant_requests").doc(requestId).set({
      data: {
        openid,
        cancelled: false,
        status: "running",
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    return false;
  });
};

// 用请求标识维护异步任务状态，避免旧任务影响当前操作。
const cancelRequest = async (requestId, openid) => {
  return db.runTransaction(async (transaction) => {
    let current = null;

    try {
      const result = await transaction.collection("class_assistant_requests").doc(requestId).get();
      current = result.data || null;
    } catch (error) {
      current = null;
    }

    if (isRequestOwnedByOther(current, openid)) {
      return fail("无权停止该请求", "permission");
    }

    const now = new Date();
    await transaction.collection("class_assistant_requests").doc(requestId).set({
      data: {
        openid,
        cancelled: true,
        status: "cancelled",
        createdAt: current && current.createdAt || now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    return { success: true, cancelled: true, requestId };
  });
};

const finishRequest = async (requestId, status) => {
  if (!requestId) return;

  try {
    await getRequestDoc(requestId).update({
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    logSafeError("askClassAssistant request state update failed", error, { stage: "request_state" });
  }
};

// 读取并整理 searchChunks 所需的数据，异步完成后再同步业务状态。
const searchChunks = async (question, handbookVersion) => {
  const chunks = await fetchHandbookChunks(handbookVersion);
  const rankedChunks = rankChunks(chunks, question, maxMatchedChunks);
  return expandContinuationChunks(chunks, rankedChunks, maxMatchedChunks);
};

const formatReference = (chunk, handbookName) => {
  const title = String(chunk.title || chunk.section || "相关条款").trim();
  const article = String(chunk.article || "").trim();
  const validArticle = /^第[一二三四五六七八九十百零〇0-9]+条$/.test(article) ? article : "";
  const page = chunk.pageText || chunk.page || "";
  const articleText = validArticle ? `，${validArticle}` : "";
  const pageText = page ? `，手册第${page}页` : "";

  return `《${handbookName}》${title}${articleText}${pageText}。`;
};

const buildCitation = (chunks, handbookName) => {
  const references = Array.from(new Set(chunks.map((chunk) => formatReference(chunk, handbookName))));
  return `依据：\n${references.map((reference, index) => `${index + 1}. ${reference}`).join("\n")}`;
};

const buildContext = (chunks, handbookName) => chunks.map((chunk, index) => {
  const reference = formatReference(chunk, handbookName);

  return `片段${index + 1}\n依据：${reference}\n正文：${String(chunk.content || "").slice(0, 1400)}`;
}).join("\n\n");

const buildSystemPrompt = (handbookName) => `你是班级助手，只能根据提供的《${handbookName}》片段回答学生关于校规、流程、请假、住宿、处分、档案等问题，不得编造片段中没有依据的规定、条件、数字、流程或结论。

只要片段已经能够直接支持问题的核心关系、条件、流程、标准或结果，就应据此回答，不得仅因片段引用了另一份管理文件、实施细则或相关规定，就判断为“未找到明确规定”。如果片段只能支持问题的一部分，应先回答已经明确的部分，并说明哪些具体细节在提供的片段中未说明；只有当现有片段无法支持问题的核心结论时，才只回答“学生手册中未找到明确规定。”

回答时应先识别用户问题的核心意图，并优先使用与该意图最直接相关的片段组织答案。如果问题只有一个明确诉求，应围绕该诉求回答，不要被片段中附带出现的其他内容带偏；如果问题同时包含多个并列诉求，应尽量覆盖所有核心诉求，不得只回答其中一部分。若片段中同时存在核心规定和背景说明、组织架构、职责分工、解释条款、附则等次要信息，应优先回答能够直接解决用户问题的规定，次要信息仅在确有助于理解或办理时补充。

回答内容的顺序应根据问题本身决定，优先呈现用户最需要知道的结论、条件、标准、步骤、结果、限制、例外或注意事项，而不是机械按照学生手册原文顺序罗列。条款跨片段时必须结合相邻续文完整理解，不得在逗号、冒号或未完句处截断，也不得把下一条、下一节或无关条款误当作续文。

当问题只有名词、简称或短语，含义不够明确时，应先给出最直接的定义、计算方式、办理规则或核心要求，再简要补充最重要的相关规定，不要无差别罗列所有包含该词的内容。回答应直接、清晰，优先给结论，再给必要说明，不要重复问题，不要堆砌无关制度内容。

回答正文后必须另起一行输出实际使用的片段编号，例如“引用片段：1,2”。只能填写确实支持回答的片段编号，不得填写未实际使用的片段；不要自行输出“依据”、条款编号、页码或引用列表，系统会把片段编号转换成真实依据。

涉及处分、退学、开除、申诉、奖助资格、学籍异动等事项时，如果片段显示仍需学校审批、认定或另有文件执行，再提示以学校相关部门最终解释或办理结果为准。不替学校做最终决定，不给法律结论。`;

const createAiError = (message, metadata = {}) => Object.assign(new Error(message), metadata);

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

// 封装远端请求生命周期，统一处理超时、取消和服务端错误。
const requestAiOnce = async (config, messages, options = {}) => {
  const startedAt = Date.now();
  try {
    return await requestDeepSeek(config, messages, {
      timeoutMs: Math.max(1000, Number(options.timeoutMs) || aiTimeoutMs),
      shouldCancel: options.shouldCancel,
    });
  } catch (error) {
    const normalizedError = Object.assign(error instanceof Error ? error : new Error("DeepSeek request failed"), {
      errorType: error && error.errorType || "network",
      stage: error && error.stage || "deepseek_request",
      latencyMs: error && error.latencyMs || Date.now() - startedAt,
    });
    logSafeError("askClassAssistant DeepSeek request failed", normalizedError, { model: config.model, stage: normalizedError.stage });
    throw normalizedError;
  }
};

// 封装远端请求生命周期，统一处理超时、取消和服务端错误。
const requestAi = async (config, messages, options = {}) => {
  const retryDelayMs = 500;
  return runWithSingleRetry(async () => {
    if (typeof options.shouldCancel === "function" && await options.shouldCancel()) {
      throw createAiError("AI request cancelled", { errorType: "cancelled", stage: "before_ai_request" });
    }

    const remainingMs = Number(options.deadlineAt) - Date.now();

    if (remainingMs <= 1000) {
      throw createAiError("request deadline exceeded", { errorType: "timeout", stage: "total_deadline" });
    }

    if (typeof options.onAttempt === "function") options.onAttempt();

    return requestAiOnce(config, messages, {
      ...options,
      timeoutMs: Math.min(aiTimeoutMs, remainingMs),
    });
  }, {
    delayMs: retryDelayMs,
    getDelayMs: (error) => Number(error && error.retryAfterMs) || retryDelayMs,
    sleep: wait,
    beforeRetry: async (error, delayMs) => {
      if (Date.now() + delayMs >= Number(options.deadlineAt)) throw error;
    },
  });
};

const getAiErrorMessage = (errorType) => {
  if (errorType === "quota") {
    return "额度不足，请联系小程序管理员";
  }

  if (errorType === "format") {
    return "回答格式异常，请稍后再试";
  }

  if (errorType === "config") {
    return "服务配置缺失，请联系小程序管理员";
  }

  if (errorType === "auth" || errorType === "permission") {
    return "AI 服务认证失败，请联系小程序管理员";
  }

  if (errorType === "rate_limit") {
    return "AI 服务繁忙，请稍后再试";
  }

  if (errorType === "timeout") {
    return "回答超时，请稍后再试";
  }

  if (errorType === "cancelled") {
    return "已停止回答";
  }

  return "回答失败，请稍后再试";
};

// 集中编排参数校验、权限控制、数据操作和异常响应。
exports.main = async (event = {}) => {
  const startAt = Date.now();
  const deadlineAt = startAt + totalTimeoutMs;
  const question = String(event.question || event.text || "").trim();
  const requestedId = String(event.requestId || "").trim();
  const requestId = requestIdPattern.test(requestedId)
    ? requestedId
    : `server_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let openid = "";
  let actor = null;
  let userType = null;
  let handbookVersion = "";
  let matchedChunkIds = [];
  let matchedChunkSummary = [];
  let contextLength = 0;
  let handbookDataVersion = "";
  let model = getSafeEnv("DEEPSEEK_MODEL") || "deepseek-flash";
  const aiProvider = "deepseek";
  let requestRegistered = false;
  let requestStatus = "failed";
  let traceId = "";
  let aiInvoked = false;
  let aiSucceeded = false;
  let rateLimitDiagnostics = {};
  const stageLatencies = {};
  const runStage = async (name, callback) => {
    const stageStart = Date.now();

    try {
      return await callback();
    } finally {
      stageLatencies[name] = Date.now() - stageStart;
    }
  };
  const usage = (values = {}) => writeUsageLog({
    openid,
    role: actor && actor.role || "user",
    userType,
    handbookVersion,
    handbookDataVersion,
    questionLength: question.length,
    matchedChunkIds,
    matchedChunkSummary,
    contextLength,
    model,
    aiProvider,
    latencyMs: Date.now() - startAt,
    stageLatencies,
    traceId,
    aiInvoked,
    aiSucceeded,
    ...rateLimitDiagnostics,
    ...values,
  });
  const isCancelled = async () => {
    const state = await readRequestState(requestId);
    return Boolean(state && state.openid === openid && state.cancelled === true);
  };

  try {
    openid = cloud.getWXContext().OPENID || "";

    if (!openid) {
      return fail("未获取到用户身份", "auth");
    }

    const userRes = await runStage("identityMs", () => db.collection("users")
      .where({ openid })
      .get());
    const identity = resolveAssistantIdentity(userRes.data || []);
    actor = identity.actor;
    userType = identity.userType;

    if (!actor) {
      await usage({ outcome: "permission_denied", errorType: "permission" });
      return fail("请先完成成员认证", "permission");
    }

    if (event.action === "cancel") {
      if (!requestIdPattern.test(requestedId)) {
        return fail("无效的请求编号", "input_invalid");
      }

      return await cancelRequest(requestId, openid);
    }

    if (!question) {
      await usage({ outcome: "input_rejected", errorType: "input_empty" });
      return fail("请输入问题", "input_empty");
    }

    if (question.length > questionMaxLength) {
      await usage({ outcome: "input_rejected", errorType: "input_too_long" });
      return fail(`问题不能超过${questionMaxLength}字`, "input_too_long");
    }

    const cancelledBeforeStart = await runStage("registerMs", () => registerRequest(requestId, openid));
    requestRegistered = true;

    if (cancelledBeforeStart) {
      requestStatus = "cancelled";
      await usage({ outcome: "ai_failed", errorType: "cancelled" });
      return fail("已停止回答", "cancelled", { requestId });
    }

    try {
      await runStage("securityMs", () => checkText(question, openid));
    } catch (error) {
      const errorType = error && error.errorType === "security_rejected" ? "security_rejected" : "security_check_failed";
      const message = errorType === "security_rejected"
        ? "输入内容可能不符合规范，请修改后再试"
        : "内容安全检测失败，请稍后再试";

      logSafeError("askClassAssistant input security check failed", error, { stage: "security" });
      await usage({ outcome: errorType === "security_rejected" ? "security_rejected" : "security_failed", errorType });
      return fail(message, errorType);
    }

    if (await isCancelled()) {
      requestStatus = "cancelled";
      await usage({ outcome: "ai_failed", errorType: "cancelled" });
      return fail("已停止回答", "cancelled", { requestId });
    }

    const supplemental = getSupplementalAnswer(question);

    if (supplemental) {
      requestStatus = "answered";
      await usage({ outcome: "supplemental_answered", errorType: "" });
      return {
        success: true,
        outcome: "supplemental_answered",
        requestId,
        answer: supplemental.answer,
      };
    }

    const activeVersion = await runStage("handbookVersionMs", getActiveHandbookVersion);

    if (!activeVersion) {
      await usage({ outcome: "config_failed", errorType: "no_handbook" });
      return fail("学生手册中未找到明确规定。", "no_handbook");
    }

    handbookVersion = activeVersion.version;
    const handbookName = activeVersion.name || `${handbookVersion}年学生手册`;
    const searchQuestion = expandQuestionAliases(question);
    const matchedChunks = await runStage("retrievalMs", () => searchChunks(searchQuestion, handbookVersion));
    handbookDataVersion = handbookChunkCache
      ? `${handbookVersion}:${handbookChunkCache.chunks.length}:${handbookChunkCache.dataHash}`
      : handbookVersion;
    matchedChunkIds = matchedChunks.map((chunk) => chunk._id).filter(Boolean);
    matchedChunkSummary = matchedChunks.map((chunk) => ({
      title: String(chunk.title || chunk.section || "").slice(0, 80),
      page: Number(chunk.pageText || chunk.page) || 0,
      article: String(chunk.article || "").slice(0, 30),
      score: Number(chunk.retrievalMeta && chunk.retrievalMeta.score) || 0,
      coveredConcepts: Array.isArray(chunk.retrievalMeta && chunk.retrievalMeta.coveredConcepts)
        ? chunk.retrievalMeta.coveredConcepts.slice(0, 6).map((item) => String(item).slice(0, 30))
        : [],
      continuation: Boolean(chunk.retrievalMeta && chunk.retrievalMeta.continuation),
    }));

    if (!matchedChunks.length) {
      requestStatus = "no_match";
      await writeUnansweredQuestion({
        question,
        handbookVersion,
        source: "retrieval_no_match",
      });
      await usage({ outcome: "no_match", errorType: "", noMatchSource: "retrieval_no_match" });
      return {
        success: true,
        outcome: "no_match",
        requestId,
        answer: noMatchAnswer,
      };
    }

    const aiConfig = getAiConfig();
    model = aiConfig.model;

    if (!aiConfig.apiKey) {
      await usage({ outcome: "config_failed", errorType: "config" });
      return fail("班级助手配置异常，请联系管理员", "config", { requestId });
    }

    if (await isCancelled()) {
      requestStatus = "cancelled";
      await usage({ outcome: "ai_failed", errorType: "cancelled" });
      return fail("已停止回答", "cancelled", { requestId });
    }

    let rateLimitResult;
    try {
      rateLimitResult = await runStage("rateLimitMs", () => consumeAssistantUserRateLimit(openid, actor.role));
    } catch (error) {
      rateLimitDiagnostics = {
        rateLimitSource: "rate_limit_storage",
        rateLimitWindow: getMinuteWindow().label,
      };
      logSafeError("askClassAssistant rate limit storage failed", error, { stage: "rate_limit_storage" });
      await usage({ outcome: "rate_limited", errorType: "rate_limit" });
      return fail("AI 服务繁忙，请稍后再试", "rate_limit", { requestId });
    }

    if (!rateLimitResult.success) {
      rateLimitDiagnostics = {
        rateLimitSource: rateLimitResult.rateLimitSource,
        rateLimitKey: rateLimitResult.rateLimitKey,
        rateLimitCurrent: rateLimitResult.rateLimitCurrent,
        rateLimitLimit: rateLimitResult.rateLimitLimit,
        rateLimitWindow: rateLimitResult.rateLimitWindow,
      };
      await usage({ outcome: "rate_limited", errorType: rateLimitResult.errorType });
      return rateLimitResult;
    }

    let aiResult;
    const modelContext = buildContext(matchedChunks, handbookName);
    contextLength = modelContext.length;

    try {
      aiResult = await runStage("aiMs", () => requestAi(aiConfig, [
        { role: "system", content: buildSystemPrompt(handbookName) },
        { role: "user", content: `学生问题：${searchQuestion}\n\n可用学生手册片段：\n${modelContext}` },
      ], {
        deadlineAt,
        shouldCancel: isCancelled,
        onAttempt: () => { aiInvoked = true; },
      }));
      traceId = aiResult.traceId;
      aiSucceeded = true;
    } catch (error) {
      const errorType = error && error.errorType ? error.errorType : "network";
      if (errorType === "rate_limit") {
        rateLimitDiagnostics = {
          rateLimitSource: error.rateLimitSource || (error.stage === "global_model_rate_limit" ? "global_qpm" : "upstream_model"),
          rateLimitKey: error.rateLimitKey,
          rateLimitCurrent: error.rateLimitCurrent,
          rateLimitLimit: error.rateLimitLimit,
          rateLimitWindow: error.rateLimitWindow || getMinuteWindow().label,
        };
      }
      traceId = String(error && error.requestId || "");
      requestStatus = errorType === "cancelled" ? "cancelled" : "failed";
      logSafeError("askClassAssistant request failed", error, { model, stage: "ai" });
      await usage({ outcome: errorType === "rate_limit" ? "rate_limited" : "ai_failed", errorType });
      return fail(getAiErrorMessage(errorType), errorType, { requestId, traceId });
    }

    const modelAnswer = String(aiResult.text || "").trim();

    if (!modelAnswer) {
      await usage({ outcome: "ai_failed", errorType: "format" });
      return fail("回答格式异常，请稍后再试", "format");
    }

    const parsedAnswer = parseModelAnswer(modelAnswer, matchedChunks, expandContinuationChunks);

    if (parsedAnswer.body === noMatchAnswer) {
      requestStatus = "no_match";
      await writeUnansweredQuestion({
        question,
        handbookVersion,
        source: "model_no_match",
      });
      await usage({ outcome: "no_match", errorType: "", noMatchSource: "model_no_match" });
      return {
        success: true,
        outcome: "no_match",
        requestId,
        traceId,
        answer: noMatchAnswer,
      };
    }

    const answerBody = parsedAnswer.body;

    if (!answerBody || !parsedAnswer.citationValid) {
      await usage({ outcome: "ai_failed", errorType: "format" });
      return fail("回答格式异常，请稍后再试", "format", { requestId, traceId });
    }

    const answer = `${answerBody}\n${buildCitation(parsedAnswer.citedChunks, handbookName)}`;

    requestStatus = "answered";
    await usage({ outcome: "answered", errorType: "" });

    return {
      success: true,
      outcome: "answered",
      requestId,
      traceId,
      answer,
    };
  } catch (error) {
    const errorType = String(error && error.errorType || "unknown");
    logSafeError("askClassAssistant failed", error, { model, stage: "main" });
    await usage({ outcome: errorType === "config" ? "config_failed" : "ai_failed", errorType });
    return fail(errorType === "config" ? "班级助手配置异常，请联系管理员" : "回答失败，请稍后再试", errorType, { requestId });
  } finally {
    if (requestRegistered) {
      await finishRequest(requestId, requestStatus);
    }
  }
};
