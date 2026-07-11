// 云函数说明：封装 index 相关的服务端校验与数据处理流程。
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const maxAttachmentSize = 20 * 1024 * 1024;
const supportedAttachmentTypes = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
const removableFields = ["tempFileURL", "tempFilePath", "localPath"];

const fail = (message) => ({
  success: false,
  message,
});

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  return value === "superAdmin" || value === "admin" ? value : "user";
};

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

const validateAndSanitizeNoticeData = (noticeData) => {
  if (!noticeData || typeof noticeData !== "object" || Array.isArray(noticeData)) {
    return { error: "事项内容不能为空" };
  }

  if (hasForbiddenTempField(noticeData)) {
    return { error: "事项内容包含无效字段" };
  }

  const title = String(noticeData.title || "").trim();
  const content = String(noticeData.content || "").trim();
  const images = noticeData.images;
  const attachments = noticeData.attachments;
  const links = noticeData.links;

  if (!title || title.length > 30) {
    return { error: title ? "标题不能超过30字" : "请填写标题" };
  }

  if (!content || content.length > 500) {
    return { error: content ? "详细内容不能超过500字" : "请填写详细内容" };
  }

  if (!Array.isArray(images) || images.length > 6 || images.some((image) => !image || !String(image.fileID || "").trim())) {
    return { error: "图片数据不符合要求" };
  }

  if (!Array.isArray(attachments) || attachments.length > 3) {
    return { error: "附件数量不能超过3个" };
  }

  const sanitizedAttachments = [];

  for (const attachment of attachments) {
    const fileID = String((attachment && attachment.fileID) || "").trim();
    const name = String((attachment && attachment.name) || "").trim();
    const size = Number(attachment && attachment.size);
    const type = String((attachment && attachment.type) || "").trim().toLowerCase();

    if (!fileID || !name || !Number.isFinite(size) || size < 0 || size > maxAttachmentSize || !supportedAttachmentTypes.includes(type)) {
      return { error: "附件数据不符合要求" };
    }

    sanitizedAttachments.push({
      fileID,
      name,
      size,
      type,
      uploadedAt: attachment.uploadedAt || new Date(),
    });
  }

  if (!Array.isArray(links) || links.length > 3) {
    return { error: "链接数量不能超过3个" };
  }

  const sanitizedLinks = [];

  for (const link of links) {
    const linkTitle = String((link && link.title) || "").trim();
    const url = String((link && link.url) || "").trim();

    if (!linkTitle && !url) {
      continue;
    }

    if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) {
      return { error: "链接格式不正确" };
    }

    sanitizedLinks.push({ title: linkTitle, url });
  }

  return {
    data: {
      title,
      category: String(noticeData.category || "").trim(),
      timeLabel: String(noticeData.timeLabel || "").trim(),
      course: String(noticeData.course || "").trim(),
      deadline: String(noticeData.deadline || "").trim(),
      endTime: String(noticeData.endTime || "").trim(),
      location: String(noticeData.location || "").trim(),
      content,
      images: images.map((image) => ({
        fileID: String(image.fileID).trim(),
        name: String(image.name || "图片").trim() || "图片",
        uploadedAt: image.uploadedAt || new Date(),
      })),
      attachments: sanitizedAttachments,
      links: sanitizedLinks,
      isImportant: noticeData.isImportant === true,
      status: "published",
    },
  };
};

// 记录审计或辅助数据；记录失败不应掩盖主业务结果。
const writeOperationLog = async (actor, noticeId, noticeData) => {
  try {
    await db.collection("operation_logs").add({
      data: {
        openid: actor.openid,
        role: normalizeRole(actor.role),
        action: "create_notice",
        success: true,
        targetType: "notice",
        targetId: noticeId,
        detail: {
          category: noticeData.category,
          success: true,
        },
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logSafeError("createNotice operation log failed", error);
  }
};

// 集中编排参数校验、权限控制、数据操作和异常响应。
exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;

    if (!openid) {
      return fail("未获取到用户身份");
    }

    const userRes = await db.collection("users")
      .where({ openid, verified: true })
      .get();
    const users = userRes.data || [];
    const actor = users.find((user) => normalizeRole(user.role) === "superAdmin")
      || users.find((user) => normalizeRole(user.role) === "admin");

    if (!actor) {
      return fail("暂无发布权限");
    }

    const validation = validateAndSanitizeNoticeData(event.noticeData);

    if (validation.error) {
      return fail(validation.error);
    }

    try {
      const allowed = await consumeRateLimit(
        openid,
        "create_notice",
        3,
        60 * 1000
      );

      if (!allowed) {
        return fail("发布过于频繁，请稍后再试");
      }
    } catch (error) {
      logSafeError("createNotice counter write failed", error);
      return fail("发布失败，请稍后重试");
    }

    const now = new Date();

    try {
      await checkNoticeSecurity(validation.data, openid);
    } catch (error) {
      logSafeError("createNotice content security check failed", error);
      return fail(error && error.securityRejected ? "内容可能不符合规范，请修改后再提交" : "内容安全检测失败，请稍后重试");
    }

    const noticeData = {
      ...validation.data,
      publisherOpenid: openid,
      publisherName: String(actor.name || "").trim() || "未知",
      createdAt: now,
      updatedAt: now,
    };
    const addRes = await db.collection("notices").add({ data: noticeData });

    await writeOperationLog({ ...actor, openid }, addRes._id, noticeData);

    return {
      success: true,
      message: "发布成功",
      noticeId: addRes._id,
    };
  } catch (error) {
    logSafeError("createNotice failed", error);
    return fail("发布失败");
  }
};
