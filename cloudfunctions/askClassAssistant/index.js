const cloud = require("wx-server-sdk");
const tcb = require("@cloudbase/node-sdk");
const {
  classifySdkError,
  extractSdkError,
  isRetryableError,
} = require("./ai-utils");
const { expandContinuationChunks, rankChunks } = require("./retrieval-utils");
const { expandQuestionAliases, getSupplementalAnswer } = require("./supplemental-answers");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const questionMaxLength = 300;
const aiTimeoutMs = 45000;
const totalTimeoutMs = 55000;
const maxAiResponseBytes = 1024 * 1024;
const cancelPollIntervalMs = 1000;
const handbookCacheTtlMs = 5 * 60 * 1000;
const maxCandidateChunks = 3000;
const maxMatchedChunks = 8;
const requestIdPattern = /^[a-zA-Z0-9_-]{12,80}$/;
let handbookChunkCache = null;
const noMatchAnswer = "学生手册中未找到明确规定。";
const aiApp = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: aiTimeoutMs });
const aiModel = aiApp.ai().createModel("cloudbase");

const fail = (message, errorType, details = {}) => ({
  success: false,
  message,
  errorType,
  ...details,
});

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  return value === "superAdmin" || value === "admin" ? value : "user";
};

const getErrorCode = (value) => Number(value && (value.errCode !== undefined ? value.errCode : value.errcode));

const logSafeError = (action, error, extra = {}) => {
  console.error(action, {
    type: error && error.name ? error.name : "Error",
    code: String(error && (error.code || error.gatewayCode || error.errCode || error.errcode) || ""),
    errorType: String(error && error.errorType || ""),
    statusCode: Number(error && error.statusCode) || 0,
    sdkType: String(error && error.sdkType || ""),
    requestId: String(error && error.requestId || ""),
    stage: String(error && error.stage || extra.stage || ""),
    latencyMs: Number(error && error.latencyMs || extra.latencyMs) || 0,
    model: String(extra.model || ""),
    channel: "cloudbase-node-sdk",
  });
};

const getSafeEnv = (name) => String(process.env[name] || "").trim();

const getAiConfig = () => {
  const model = getSafeEnv("AI_MODEL") || "hy3-preview";
  return { model };
};

const getShanghaiDateKey = () => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date()).replace(/\D/g, "");

const buildCounter = (openid, action, bucketKey, windowMs) => {
  const safeOpenid = openid.replace(/[^a-zA-Z0-9_-]/g, "_");

  return {
    id: `${action}_${safeOpenid}_${bucketKey}`,
    action,
    bucketStart: new Date(Math.floor(Date.now() / windowMs) * windowMs),
    windowMs,
  };
};

const readCounter = async (transaction, counter) => {
  try {
    const result = await transaction.collection("security_counters").doc(counter.id).get();
    return result.data || null;
  } catch (error) {
    return null;
  }
};

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

const consumeRateLimit = async (openid, role) => {
  const dailyLimit = normalizeRole(role) === "superAdmin" ? 50 : 20;
  const dailyCounter = buildCounter(openid, "class_assistant_daily", getShanghaiDateKey(), 24 * 60 * 60 * 1000);
  const minuteCounter = buildCounter(openid, "class_assistant_minute", String(Math.floor(Date.now() / (60 * 1000)) * 60 * 1000), 60 * 1000);

  return db.runTransaction(async (transaction) => {
    const daily = await readCounter(transaction, dailyCounter);
    const dailyCount = Number(daily && daily.count) || 0;

    if (dailyCount >= dailyLimit) {
      return fail("今日提问次数已用完，请明天再试。", "daily_limit");
    }

    const minute = await readCounter(transaction, minuteCounter);
    const minuteCount = Number(minute && minute.count) || 0;

    if (minuteCount >= 3) {
      return fail("提问太频繁了，请稍后再试。", "minute_limit");
    }

    await writeCounter(transaction, dailyCounter, openid, daily);
    await writeCounter(transaction, minuteCounter, openid, minute);

    return { success: true };
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

const writeUsageLog = async ({ openid, role, handbookVersion, questionLength, matchedChunkIds, outcome, errorType, model, latencyMs, stageLatencies, traceId, aiInvoked, aiSucceeded }) => {
  if (!openid) {
    return;
  }

  try {
    await db.collection("class_assistant_logs").add({
      data: {
        openid,
        role: normalizeRole(role),
        handbookVersion: String(handbookVersion || ""),
        questionLength: Number(questionLength) || 0,
        matchedChunkIds: Array.isArray(matchedChunkIds) ? matchedChunkIds : [],
        outcome: String(outcome || "ai_failed"),
        errorType: String(errorType || ""),
        model: String(model || ""),
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

const cancelRequest = async (requestId, openid) => {
  return db.runTransaction(async (transaction) => {
    let current = null;

    try {
      const result = await transaction.collection("class_assistant_requests").doc(requestId).get();
      current = result.data || null;
    } catch (error) {
      current = null;
    }

    if (current && current.openid !== openid) {
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

const stripModelCitation = (answer) => {
  const text = String(answer || "").trim();
  const citationIndex = text.indexOf("依据：");
  return (citationIndex < 0 ? text : text.slice(0, citationIndex)).trim();
};

const parseModelAnswer = (answer, chunks) => {
  const text = stripModelCitation(answer);
  const markerIndex = text.search(/引用片段[：:]/);
  const markerLine = markerIndex >= 0 ? text.slice(markerIndex).split(/\r?\n/, 1)[0] : "";
  const body = (markerIndex >= 0 ? text.slice(0, markerIndex) : text).trim();
  const indexes = markerLine
    ? Array.from(new Set((markerLine.match(/\d+/g) || []).map(Number)
      .filter((value) => value >= 1 && value <= chunks.length)))
    : [];
  const citedIndexes = indexes.length ? indexes : [1];
  const citedChunks = [];

  citedIndexes.forEach((value) => {
    const chunk = chunks[value - 1];
    if (!chunk) return;
    citedChunks.push(chunk);

    if (!/[。！？；]$/.test(String(chunk.content || "").trim()) && chunks[value]) {
      citedChunks.push(chunks[value]);
    }
  });

  return { body, citedChunks: Array.from(new Set(citedChunks)) };
};

const buildContext = (chunks, handbookName) => chunks.map((chunk, index) => {
  const reference = formatReference(chunk, handbookName);

  return `片段${index + 1}\n依据：${reference}\n正文：${String(chunk.content || "").slice(0, 1400)}`;
}).join("\n\n");

const buildSystemPrompt = (handbookName) => `你是班级助手，只能根据提供的《${handbookName}》片段回答学生关于校规、流程、请假、住宿、处分、档案等问题。
不得编造没有依据的规定。
找不到依据时只回答“学生手册中未找到明确规定。”
回答正文后必须另起一行输出实际使用的片段编号，例如“引用片段：1,2”。只能填写确实支持回答的片段编号，不要输出“依据”、条款编号、页码或引用列表；系统会把片段编号转换成真实依据。
问题只有名词或短语、含义不够明确时，应先回答最直接的定义、计算方式或办理规则，再概括其他主要相关规定；不能只摘取某一个包含该词的局部条件。条款跨片段时必须结合相邻续文完整回答，不得在逗号、冒号或未完句处截断。
涉及处分、退学、开除、申诉、奖助资格、学籍异动等事项时，提示以学校相关部门最终解释为准。
不替学校做最终决定，不给法律结论。`;

const createAiError = (message, metadata = {}) => Object.assign(new Error(message), metadata);

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const requestAiOnce = async (config, messages, options = {}) => {
  const startedAt = Date.now();
  let reader = null;
  let dataCancelPromise = Promise.resolve();
  let completed = false;

  try {
    const result = await aiModel.streamText({
      model: config.model,
      messages,
      temperature: 0.2,
    }, {
      timeout: Math.max(1000, Number(options.timeoutMs) || aiTimeoutMs),
    });

    if (result.error) {
      throw result.error;
    }

    if (!result.textStream || typeof result.textStream.getReader !== "function") {
      throw createAiError("AI SDK text stream unavailable", { errorType: "format", stage: "sdk_stream" });
    }

    if (result.dataStream && typeof result.dataStream.cancel === "function") {
      dataCancelPromise = result.dataStream.cancel("text stream only").catch(() => undefined);
    }

    reader = result.textStream.getReader();
    let text = "";
    let responseBytes = 0;
    let pendingRead = reader.read();
    let nextControlCheckAt = Date.now() + cancelPollIntervalMs;
    const assertRequestActive = async () => {
      if (typeof options.shouldCancel === "function" && await options.shouldCancel()) {
        throw createAiError("AI request cancelled", { errorType: "cancelled", stage: "sdk_stream" });
      }

      if (Date.now() >= Number(options.deadlineAt)) {
        throw createAiError("request deadline exceeded", { errorType: "timeout", stage: "total_deadline" });
      }

      nextControlCheckAt = Date.now() + cancelPollIntervalMs;
    };

    while (true) {
      const event = await Promise.race([
        pendingRead.then((value) => ({ type: "chunk", value })),
        wait(cancelPollIntervalMs).then(() => ({ type: "poll" })),
      ]);

      if (event.type === "poll") {
        await assertRequestActive();
        continue;
      }

      if (event.value.done) {
        completed = true;
        break;
      }

      const chunk = String(event.value.value || "");
      responseBytes += Buffer.byteLength(chunk);

      if (responseBytes > maxAiResponseBytes) {
        throw createAiError("AI response too large", { errorType: "format", stage: "sdk_stream" });
      }

      text += chunk;

      if (Date.now() >= nextControlCheckAt) {
        await assertRequestActive();
      }

      pendingRead = reader.read();
    }

    return { text, traceId: "" };
  } catch (error) {
    if (error && error.errorType) {
      throw Object.assign(error, { latencyMs: error.latencyMs || Date.now() - startedAt });
    }

    const details = extractSdkError(error);
    throw Object.assign(error instanceof Error ? error : new Error(details.message || "AI SDK request failed"), {
      errorType: classifySdkError(details),
      code: details.code,
      statusCode: details.statusCode,
      sdkType: details.type,
      requestId: details.requestId,
      stage: "sdk_stream",
      latencyMs: Date.now() - startedAt,
    });
  } finally {
    if (reader) {
      if (!completed) {
        await reader.cancel("request finished").catch(() => undefined);
      }
      reader.releaseLock();
    }
    await dataCancelPromise;
  }
};

const requestAi = async (config, messages, options = {}) => {
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (typeof options.shouldCancel === "function" && await options.shouldCancel()) {
      throw createAiError("AI request cancelled", { errorType: "cancelled", stage: "before_ai_request" });
    }

    const remainingMs = Number(options.deadlineAt) - Date.now();

    if (remainingMs <= 1000) {
      throw createAiError("request deadline exceeded", { errorType: "timeout", stage: "total_deadline" });
    }

    try {
      return await requestAiOnce(config, messages, {
        ...options,
        timeoutMs: Math.min(aiTimeoutMs, remainingMs),
      });
    } catch (error) {
      lastError = error;

      if (attempt > 0 || !isRetryableError(error)) {
        throw error;
      }

      const delayMs = 150 + Math.floor(Math.random() * 250);

      if (Date.now() + delayMs >= Number(options.deadlineAt)) {
        throw error;
      }

      await wait(delayMs);
    }
  }

  throw lastError;
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
  let handbookVersion = "";
  let matchedChunkIds = [];
  let model = getSafeEnv("AI_MODEL") || "hy3-preview";
  let requestRegistered = false;
  let requestStatus = "failed";
  let traceId = "";
  let aiInvoked = false;
  let aiSucceeded = false;
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
    handbookVersion,
    questionLength: question.length,
    matchedChunkIds,
    model,
    latencyMs: Date.now() - startAt,
    stageLatencies,
    traceId,
    aiInvoked,
    aiSucceeded,
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
      .where({ openid, verified: true })
      .get());
    const users = userRes.data || [];
    actor = users.find((user) => normalizeRole(user.role) === "superAdmin")
      || users.find((user) => normalizeRole(user.role) === "admin")
      || users[0];

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
    matchedChunkIds = matchedChunks.map((chunk) => chunk._id).filter(Boolean);

    if (!matchedChunks.length) {
      requestStatus = "no_match";
      await usage({ outcome: "no_match", errorType: "" });
      return {
        success: true,
        outcome: "no_match",
        requestId,
        answer: noMatchAnswer,
      };
    }

    const aiConfig = getAiConfig();
    model = aiConfig.model;

    if (await isCancelled()) {
      requestStatus = "cancelled";
      await usage({ outcome: "ai_failed", errorType: "cancelled" });
      return fail("已停止回答", "cancelled", { requestId });
    }

    const rateLimitResult = await runStage("rateLimitMs", () => consumeRateLimit(openid, actor.role));

    if (!rateLimitResult.success) {
      await usage({ outcome: "rate_limited", errorType: rateLimitResult.errorType });
      return rateLimitResult;
    }

    let aiResult;

    try {
      aiInvoked = true;
      aiResult = await runStage("aiMs", () => requestAi(aiConfig, [
        { role: "system", content: buildSystemPrompt(handbookName) },
        { role: "user", content: `学生问题：${searchQuestion}\n\n可用学生手册片段：\n${buildContext(matchedChunks, handbookName)}` },
      ], {
        deadlineAt,
        shouldCancel: isCancelled,
      }));
      traceId = aiResult.traceId;
      aiSucceeded = true;
    } catch (error) {
      const errorType = error && error.errorType ? error.errorType : "network";
      traceId = String(error && error.requestId || "");
      requestStatus = errorType === "cancelled" ? "cancelled" : "failed";
      logSafeError("askClassAssistant request failed", error, { model, stage: "ai" });
      await usage({ outcome: "ai_failed", errorType });
      return fail(getAiErrorMessage(errorType), errorType, { requestId, traceId });
    }

    const modelAnswer = String(aiResult.text || "").trim();

    if (!modelAnswer) {
      await usage({ outcome: "ai_failed", errorType: "format" });
      return fail("回答格式异常，请稍后再试", "format");
    }

    const parsedAnswer = parseModelAnswer(modelAnswer, matchedChunks);

    if (parsedAnswer.body === noMatchAnswer) {
      requestStatus = "no_match";
      await usage({ outcome: "no_match", errorType: "" });
      return {
        success: true,
        outcome: "no_match",
        requestId,
        traceId,
        answer: noMatchAnswer,
      };
    }

    const answerBody = parsedAnswer.body;

    if (!answerBody) {
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
