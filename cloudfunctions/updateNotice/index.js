// 云函数说明：封装 index 相关的服务端校验与数据处理流程。
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const maxAttachmentSize = 20 * 1024 * 1024;
const supportedAttachmentTypes = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
const forbiddenFields = ["_id", "publisherOpenid", "publisherName", "createdAt"];
const removableFields = ["tempFileURL", "tempFilePath", "localPath"];
const allowedFields = [
  "title",
  "category",
  "course",
  "location",
  "deadline",
  "endTime",
  "timeLabel",
  "content",
  "isImportant",
  "images",
  "attachments",
  "links",
  "status",
];

const fail = (message) => ({ success: false, message });
const success = (message) => ({ success: true, message });
const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  return value === "superAdmin" || value === "admin" ? value : "user";
};

const getActor = (users) => users.find((user) => normalizeRole(user.role) === "superAdmin")
  || users.find((user) => normalizeRole(user.role) === "admin")
  || users[0]
  || {};

const getErrorCode = (value) => Number(value && (value.errCode !== undefined ? value.errCode : value.errcode));

const logSafeError = (action, error) => {
  console.error(action, {
    type: error && error.name ? error.name : "Error",
    code: getErrorCode(error),
    rejected: Boolean(error && error.securityRejected),
  });
};

// 在事务中消费操作配额，防止并发请求绕过频率限制。
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

// 在后续处理前验证输入和业务约束，失败时立即终止无效流程。
const checkText = async (content, openid) => {
  const text = String(content || "").trim();

  if (!text) return;

  const result = await cloud.openapi.security.msgSecCheck({
    content: text,
    version: 2,
    scene: 2,
    openid,
  });

  if (isRejectedResult(result)) {
    const error = new Error("Content rejected");
    error.securityRejected = true;
    throw error;
  }

  const errCode = getErrorCode(result);

  if (!Number.isNaN(errCode) && errCode !== 0) {
    const error = new Error("Content check failed");
    error.errCode = errCode;
    throw error;
  }
};

const getImageContentType = (fileID) => {
  const value = String(fileID || "").split("?")[0].toLowerCase();

  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".gif")) return "image/gif";
  if (value.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

// 在后续处理前验证输入和业务约束，失败时立即终止无效流程。
const checkImage = async (image) => {
  const fileID = String((image && image.fileID) || "").trim();
  const downloadResult = await cloud.downloadFile({ fileID });
  const result = await cloud.openapi.security.imgSecCheck({
    media: {
      contentType: getImageContentType(fileID),
      value: downloadResult.fileContent,
    },
  });

  if (isRejectedResult(result)) {
    const error = new Error("Image rejected");
    error.securityRejected = true;
    throw error;
  }

  const errCode = getErrorCode(result);

  if (!Number.isNaN(errCode) && errCode !== 0) {
    const error = new Error("Image check failed");
    error.errCode = errCode;
    throw error;
  }
};

// 在后续处理前验证输入和业务约束，失败时立即终止无效流程。
const checkNoticeSecurity = async (noticeData, openid) => {
  const textItems = [
    noticeData.title,
    noticeData.category,
    noticeData.timeLabel,
    noticeData.course,
    noticeData.deadline,
    noticeData.endTime,
    noticeData.location,
    noticeData.content,
  ];

  noticeData.links.forEach((link) => {
    textItems.push(link.title, link.url);
  });
  noticeData.images.forEach((image) => {
    textItems.push(image.name);
  });
  noticeData.attachments.forEach((attachment) => {
    textItems.push(attachment.name);
  });

  for (const text of textItems) {
    await checkText(text, openid);
  }

  for (const image of noticeData.images) {
    await checkImage(image);
  }
};

const hasForbiddenTempField = (value) => {
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenTempField(item));
  }

  if (!value || typeof value !== "object" || value instanceof Date) {
    return false;
  }

  return Object.keys(value).some((key) => removableFields.includes(key) || hasForbiddenTempField(value[key]));
};

const validateNoticeData = (noticeData) => {
  const title = String(noticeData.title || "").trim();
  const content = String(noticeData.content || "").trim();
  const images = noticeData.images;
  const attachments = noticeData.attachments;
  const links = noticeData.links;

  if (hasForbiddenTempField(noticeData)) return "事项内容包含无效字段";
  if (!title || title.length > 30) return title ? "标题不能超过30字" : "请填写标题";
  if (!content || content.length > 500) return content ? "详细内容不能超过500字" : "请填写详细内容";

  if (!Array.isArray(images) || images.length > 6 || images.some((image) => !image || !String(image.fileID || "").trim())) {
    return "图片数据不符合要求";
  }

  if (!Array.isArray(attachments) || attachments.length > 3) {
    return "附件数量不能超过3个";
  }

  for (const attachment of attachments) {
    const fileID = String((attachment && attachment.fileID) || "").trim();
    const name = String((attachment && attachment.name) || "").trim();
    const size = Number(attachment && attachment.size);
    const type = String((attachment && attachment.type) || "").trim().toLowerCase();

    if (!fileID || !name || !Number.isFinite(size) || size < 0 || size > maxAttachmentSize || !supportedAttachmentTypes.includes(type)) {
      return "附件数据不符合要求";
    }
  }

  if (!Array.isArray(links) || links.length > 3) {
    return "链接数量不能超过3个";
  }

  for (const link of links) {
    const titleValue = String((link && link.title) || "").trim();
    const url = String((link && link.url) || "").trim();

    if (!titleValue && !url) continue;
    if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) return "链接格式不正确";
  }

  return "";
};

const stripValue = (value) => {
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => stripValue(item)).filter((item) => item !== undefined);
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const next = {};

    Object.keys(value).forEach((key) => {
      if (removableFields.includes(key)) return;

      const nextValue = stripValue(value[key]);

      if (nextValue !== undefined) next[key] = nextValue;
    });

    return next;
  }

  return value;
};

const sanitizeNoticeData = (noticeData) => {
  const data = {};

  allowedFields.forEach((key) => {
    if (!hasOwn(noticeData, key)) return;

    const value = stripValue(noticeData[key]);

    if (value !== undefined) data[key] = value;
  });

  data.title = String(data.title || "").trim();
  data.content = String(data.content || "").trim();
  data.images = data.images.map((image) => ({
    fileID: String(image.fileID).trim(),
    name: String(image.name || "图片").trim() || "图片",
    uploadedAt: image.uploadedAt || new Date(),
  }));
  data.attachments = data.attachments.map((attachment) => ({
    fileID: String(attachment.fileID).trim(),
    name: String(attachment.name).trim(),
    size: Number(attachment.size),
    type: String(attachment.type).trim().toLowerCase(),
    uploadedAt: attachment.uploadedAt || new Date(),
  }));
  data.links = data.links
    .map((link) => ({
      title: String((link && link.title) || "").trim(),
      url: String((link && link.url) || "").trim(),
    }))
    .filter((link) => link.title || link.url);
  data.updatedAt = new Date();

  return data;
};

// 记录审计或辅助数据；记录失败不应掩盖主业务结果。
const writeOperationLog = async (actor, openid, noticeId, beforeTitle, afterTitle) => {
  try {
    await db.collection("operation_logs").add({
      data: {
        openid,
        role: normalizeRole(actor.role),
        action: "update_notice",
        success: true,
        targetType: "notice",
        targetId: noticeId,
        detail: {
          titleChanged: beforeTitle !== afterTitle,
          success: true,
        },
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logSafeError("updateNotice operation log failed", error);
  }
};

// 集中编排参数校验、权限控制、数据操作和异常响应。
exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    const noticeId = String(event.noticeId || "").trim();
    const noticeData = event.noticeData;

    if (!openid) return fail("未获取到用户身份");
    if (!noticeId) return fail("事项信息异常");
    if (!noticeData || typeof noticeData !== "object" || Array.isArray(noticeData)) {
      return fail("事项内容不能为空");
    }

    if (forbiddenFields.some((field) => hasOwn(noticeData, field))) {
      return fail("事项内容包含不可修改字段");
    }

    const userRes = await db.collection("users")
      .where({ openid })
      .get();
    const verifiedUsers = (userRes.data || []).filter((user) => user.verified === true);
    const actor = getActor(verifiedUsers);
    const isSuperAdmin = verifiedUsers.some((user) => normalizeRole(user.role) === "superAdmin");
    const isAdmin = isSuperAdmin || verifiedUsers.some((user) => normalizeRole(user.role) === "admin");

    if (!isAdmin) return fail("暂无操作权限");

    let notice;

    try {
      const noticeRes = await db.collection("notices").doc(noticeId).get();
      notice = noticeRes.data;
    } catch (error) {
      return fail("事项不存在或已被删除");
    }

    if (!notice) return fail("事项不存在或已被删除");

    const canUpdate = isSuperAdmin || (notice.publisherOpenid && notice.publisherOpenid === openid);

    if (!canUpdate) return fail("暂无操作权限");

    const validationError = validateNoticeData(noticeData);

    if (validationError) return fail(validationError);

    const updateData = sanitizeNoticeData(noticeData);

    try {
      const allowed = await consumeRateLimit(
        openid,
        "update_notice",
        5,
        60 * 1000
      );

      if (!allowed) {
        return fail("操作过于频繁，请稍后再试");
      }
    } catch (error) {
      logSafeError("updateNotice counter write failed", error);
      return fail("修改失败，请稍后重试");
    }

    try {
      await checkNoticeSecurity(updateData, openid);
    } catch (error) {
      logSafeError("updateNotice content security check failed", error);
      return fail(error && error.securityRejected ? "内容可能不符合规范，请修改后再提交" : "内容安全检测失败，请稍后重试");
    }

    try {
      await db.collection("notices").doc(noticeId).update({ data: updateData });
      const verifyRes = await db.collection("notices").doc(noticeId).get();

      if (!verifyRes.data) return fail("事项不存在或已被删除");

      const beforeTitle = String(notice.title || "").trim();
      const afterTitle = String(verifyRes.data.title || beforeTitle).trim();

      await writeOperationLog(actor, openid, noticeId, beforeTitle, afterTitle);
      return success("修改成功");
    } catch (error) {
      logSafeError("updateNotice update failed", error);
      return fail("修改失败");
    }
  } catch (error) {
    logSafeError("updateNotice failed", error);
    return fail("修改失败");
  }
};
