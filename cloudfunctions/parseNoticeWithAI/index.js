const cloud = require("wx-server-sdk");
const tcb = require("@cloudbase/node-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const inputMaxLength = 500;
const aiTimeoutMs = 20000;
const aiApp = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: aiTimeoutMs });
const aiModel = aiApp.ai().createModel("cloudbase");
const categories = ["考试安排", "作业信息", "活动信息", "班级通知", "其他"];
const timeLabels = ["考试时间", "截止时间", "报名截止", "活动时间", "相关时间"];
const stringLimits = {
  title: 30,
  category: 20,
  timeLabel: 20,
  course: 50,
  deadline: 16,
  endTime: 16,
  location: 80,
  content: 500,
};

const fail = (message, errorType) => ({
  success: false,
  message,
  errorType,
});

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  return value === "superAdmin" || value === "admin" ? value : "user";
};

const getErrorCode = (value) => Number(value && (value.errCode !== undefined ? value.errCode : value.errcode));

const logSafeError = (action, error) => {
  console.error(action, {
    type: error && error.name ? error.name : "Error",
    code: String(error && (error.code || error.errCode || error.errcode) || ""),
    errorType: String(error && error.errorType || ""),
    statusCode: Number(error && (error.statusCode || error.status)) || 0,
    requestId: String(error && (error.requestId || error.request_id) || ""),
    channel: "cloudbase-node-sdk",
    rejected: Boolean(error && error.securityRejected),
  });
};

const getSafeEnv = (name) => String(process.env[name] || "").trim();

const getAiConfig = () => {
  const model = getSafeEnv("AI_MODEL") || "hy3-preview";
  return { model };
};

const getChinaTime = (date) => {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} Asia/Shanghai`;
};

const writeUsageLog = async ({ openid, role, inputLength, success, errorType, model, latencyMs }) => {
  if (!openid) {
    return;
  }

  try {
    await db.collection("ai_usage_logs").add({
      data: {
        openid,
        role: normalizeRole(role),
        inputLength: Number(inputLength) || 0,
        success: success === true,
        errorType: String(errorType || ""),
        model: String(model || ""),
        latencyMs: Number(latencyMs) || 0,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logSafeError("parseNoticeWithAI usage log failed", error);
  }
};

const consumeRateLimit = async (openid, action, limit, windowMs) => {
  const bucketStart = Math.floor(Date.now() / windowMs) * windowMs;
  const safeOpenid = openid.replace(/[^a-zA-Z0-9_-]/g, "_");
  const counterId = `${action}_${safeOpenid}_${bucketStart}`;

  return db.runTransaction(async (transaction) => {
    let counter = null;

    try {
      const result = await transaction
        .collection("security_counters")
        .doc(counterId)
        .get();
      counter = result.data;
    } catch (error) {
      counter = null;
    }

    const count = Number(counter && counter.count) || 0;

    if (count >= limit) {
      return false;
    }

    const now = new Date();
    const data = {
      openid,
      action,
      count: count + 1,
      windowStart: new Date(bucketStart),
      windowMs,
      updatedAt: now,
      expiresAt: new Date(bucketStart + windowMs * 2),
    };

    if (counter) {
      await transaction
        .collection("security_counters")
        .doc(counterId)
        .update({ data });
    } else {
      await transaction
        .collection("security_counters")
        .doc(counterId)
        .set({
          data: {
            ...data,
            createdAt: now,
          },
        });
    }

    return true;
  });
};

const isRejectedResult = (result) => {
  const suggest = result && result.result && result.result.suggest;

  return suggest === "risky" || suggest === "review" || getErrorCode(result) === 87014;
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
    const error = new Error("AI input rejected");
    error.securityRejected = true;
    throw error;
  }

  const errCode = getErrorCode(result);

  if (!Number.isNaN(errCode) && errCode !== 0) {
    const error = new Error("AI input security check failed");
    error.errCode = errCode;
    throw error;
  }
};

const buildSystemPrompt = (baseTime) => `你是班级事项发布草稿解析助手。
当前基准时间：${baseTime}。
你只能把管理员输入的一句话转换为 JSON 草稿，不能发布事项。
只能返回 JSON。
不要返回 Markdown。
不要使用代码块。
不要解释。
字段必须严格符合示例。
没有识别出的信息留空。
不确定的信息不要编造，写入 warnings。
第一版不支持附件、图片、链接，不要生成相关字段。
发布人来自当前操作人，不要生成发布人字段。
category 只能是：考试安排、作业信息、活动信息、班级通知、其他。
timeLabel 只能是：考试时间、截止时间、报名截止、活动时间、相关时间。
deadline 是完整开始时间、截止时间或相关时间，例如 2026-07-03 17:30；如果只有日期没有具体时间，可以只返回 2026-07-03。
endTime 是完整结束时间，例如 2026-07-03 18:00。
相对时间必须结合当前基准时间解析。
区间时间必须返回完整 deadline 和完整 endTime。
如果同一天的区间时间，deadline 和 endTime 使用同一个日期。
如果只识别到结束时间、没有单独识别到结束日期，默认结束日期使用 deadline 的日期。
如果日期不确定，相关时间字段留空并写入 warnings。
返回示例：
{"title":"","category":"","timeLabel":"","course":"","deadline":"","endTime":"","location":"","content":"","isImportant":false,"warnings":[]}`;

const classifyAiError = (error) => {
  const source = error && typeof error === "object" ? error : {};
  const message = String(source.message || error || "").toLowerCase();
  const code = String(source.code || source.errCode || "").toLowerCase();
  const statusCode = Number(source.statusCode || source.status) || 0;
  const haystack = `${code} ${message}`;

  if (statusCode === 401 || haystack.includes("invalid_api_key") || haystack.includes("authentication")) return "auth";
  if (statusCode === 403 || haystack.includes("permission") || haystack.includes("not_allowed")) return "permission";
  if (haystack.includes("token_quota") || haystack.includes("quota") || haystack.includes("insufficient")) return "quota";
  if (statusCode === 429 || haystack.includes("rate") || haystack.includes("too many requests")) return "rate_limit";
  if (statusCode === 404 || haystack.includes("model_not_found") || haystack.includes("model_disabled") || haystack.includes("config_missing")) return "config";
  if (haystack.includes("timeout") || haystack.includes("timed out")) return "timeout";

  return "network";
};

const requestAi = async (config, messages) => {
  try {
    const result = await aiModel.generateText({
      model: config.model,
      messages,
      temperature: 0.2,
    }, {
      timeout: aiTimeoutMs,
    });

    if (result.error) {
      throw result.error;
    }

    return String(result.text || "");
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error("AI SDK request failed"), {
      errorType: error && error.errorType || classifyAiError(error),
    });
  }
};

const parseAiContent = (content) => {
  const text = String(content || "").trim();

  if (!text || text.includes("```")) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
};

const trimByLimit = (value, limit) => {
  const text = String(value || "").trim();

  return text.length > limit ? text.slice(0, limit) : text;
};

const trimDraftField = (rawDraft, key, limit, warnings, label) => {
  const text = String(rawDraft[key] || "").trim();

  if (text.length > limit) {
    pushWarning(warnings, `${label}已按长度限制自动截断`);
    return text.slice(0, limit);
  }

  return text;
};

const isValidDateTime = (value) => {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?: ([01]\d|2[0-3]):([0-5]\d))?$/);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const pushWarning = (warnings, message) => {
  const text = trimByLimit(message, 80);

  if (text && warnings.length < 5) {
    warnings.push(text);
  }
};

const sanitizeDraft = (rawDraft) => {
  if (!rawDraft || typeof rawDraft !== "object" || Array.isArray(rawDraft)) {
    return null;
  }

  const rawWarnings = Array.isArray(rawDraft.warnings)
    ? rawDraft.warnings.slice(0, 5)
    : [];
  const warnings = [];
  const draft = {
    title: trimDraftField(rawDraft, "title", stringLimits.title, warnings, "标题"),
    category: trimDraftField(rawDraft, "category", stringLimits.category, warnings, "分类"),
    timeLabel: trimDraftField(rawDraft, "timeLabel", stringLimits.timeLabel, warnings, "时间类型"),
    course: trimDraftField(rawDraft, "course", stringLimits.course, warnings, "课程/事项名称"),
    deadline: trimDraftField(rawDraft, "deadline", stringLimits.deadline, warnings, "开始或截止时间"),
    endTime: trimDraftField(rawDraft, "endTime", stringLimits.endTime, warnings, "结束时间"),
    location: trimDraftField(rawDraft, "location", stringLimits.location, warnings, "地点"),
    content: trimDraftField(rawDraft, "content", stringLimits.content, warnings, "详细内容"),
    isImportant: rawDraft.isImportant === true,
    warnings,
  };

  if (draft.category && !categories.includes(draft.category)) {
    draft.category = "";
    pushWarning(draft.warnings, "AI 返回的分类不在允许范围内，已置空");
  }

  if (draft.timeLabel && !timeLabels.includes(draft.timeLabel)) {
    draft.timeLabel = "";
    pushWarning(draft.warnings, "AI 返回的时间类型不在允许范围内，已置空");
  }

  if (draft.deadline && !isValidDateTime(draft.deadline)) {
    draft.deadline = "";
    pushWarning(draft.warnings, "AI 返回的开始或截止时间格式不正确，已置空");
  }

  if (draft.endTime && !isValidDateTime(draft.endTime)) {
    draft.endTime = "";
    pushWarning(draft.warnings, "AI 返回的结束时间格式不正确，已置空");
  }

  rawWarnings.forEach((warning) => {
    pushWarning(draft.warnings, warning);
  });

  return draft;
};

const getAiErrorMessage = (errorType) => {
  if (errorType === "quota") {
    return "额度不足，请联系小程序管理员";
  }

  if (errorType === "format") {
    return "返回格式异常，请重试";
  }

  if (errorType === "config") {
    return "服务配置缺失，请联系小程序管理员";
  }

  if (errorType === "auth" || errorType === "permission") {
    return "AI 服务权限不足，请联系小程序管理员";
  }

  if (errorType === "rate_limit") {
    return "AI 服务繁忙，请稍后再试";
  }

  if (errorType === "timeout") {
    return "AI 生成超时，请稍后再试";
  }

  return "服务连接失败，请稍后重试或联系小程序管理员";
};

exports.main = async (event = {}) => {
  const startAt = Date.now();
  const input = String(event.text || event.input || "").trim();
  let openid = "";
  let actor = null;
  let model = getSafeEnv("AI_MODEL") || "hy3-preview";

  try {
    openid = cloud.getWXContext().OPENID;

    if (!openid) {
      return fail("未获取到用户身份", "auth");
    }

    const userRes = await db.collection("users")
      .where({ openid, verified: true })
      .get();
    const users = userRes.data || [];
    actor = users.find((user) => normalizeRole(user.role) === "superAdmin")
      || users.find((user) => normalizeRole(user.role) === "admin");

    if (!actor) {
      await writeUsageLog({ openid, role: "user", inputLength: input.length, success: false, errorType: "permission", model, latencyMs: Date.now() - startAt });
      return fail("暂无 AI 辅助发布权限", "permission");
    }

    if (!input) {
      await writeUsageLog({ openid, role: actor.role, inputLength: 0, success: false, errorType: "input_empty", model, latencyMs: Date.now() - startAt });
      return fail("请输入需要解析的内容", "input_empty");
    }

    if (input.length > inputMaxLength) {
      await writeUsageLog({ openid, role: actor.role, inputLength: input.length, success: false, errorType: "input_too_long", model, latencyMs: Date.now() - startAt });
      return fail(`输入内容不能超过${inputMaxLength}字`, "input_too_long");
    }

    try {
      await checkText(input, openid);
    } catch (error) {
      logSafeError("parseNoticeWithAI input security check failed", error);
      await writeUsageLog({ openid, role: actor.role, inputLength: input.length, success: false, errorType: "security", model, latencyMs: Date.now() - startAt });
      return fail("输入内容可能不符合规范，请修改后再试", "security");
    }

    try {
      const allowed = await consumeRateLimit(openid, "parse_notice_ai", 3, 60 * 1000);

      if (!allowed) {
        await writeUsageLog({ openid, role: actor.role, inputLength: input.length, success: false, errorType: "rate_limit", model, latencyMs: Date.now() - startAt });
        return fail("生成过于频繁，请稍后再试", "rate_limit");
      }
    } catch (error) {
      logSafeError("parseNoticeWithAI counter write failed", error);
      await writeUsageLog({ openid, role: actor.role, inputLength: input.length, success: false, errorType: "rate_counter", model, latencyMs: Date.now() - startAt });
      return fail("生成过于频繁，请稍后再试", "rate_counter");
    }

    const aiConfig = getAiConfig();
    model = aiConfig.model;

    let aiRes;

    try {
      aiRes = await requestAi(aiConfig, [
        { role: "system", content: buildSystemPrompt(getChinaTime(new Date())) },
        { role: "user", content: input },
      ]);
    } catch (error) {
      const errorType = error && error.errorType ? error.errorType : "network";
      logSafeError("parseNoticeWithAI request failed", error);
      await writeUsageLog({ openid, role: actor.role, inputLength: input.length, success: false, errorType, model, latencyMs: Date.now() - startAt });
      return fail(getAiErrorMessage(errorType), errorType);
    }

    const rawDraft = parseAiContent(aiRes);
    const draft = sanitizeDraft(rawDraft);

    if (!draft) {
      await writeUsageLog({ openid, role: actor.role, inputLength: input.length, success: false, errorType: "format", model, latencyMs: Date.now() - startAt });
      return fail("返回格式异常，请重试", "format");
    }

    await writeUsageLog({ openid, role: actor.role, inputLength: input.length, success: true, errorType: "", model, latencyMs: Date.now() - startAt });

    return {
      success: true,
      draft,
    };
  } catch (error) {
    logSafeError("parseNoticeWithAI failed", error);
    await writeUsageLog({ openid, role: actor && actor.role, inputLength: input.length, success: false, errorType: "unknown", model, latencyMs: Date.now() - startAt });
    return fail("服务连接失败，请稍后重试或联系小程序管理员", "unknown");
  }
};
