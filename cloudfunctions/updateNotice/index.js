const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
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
  "updatedAt",
];

const fail = (message) => ({
  success: false,
  message,
});

const success = (message) => ({
  success: true,
  message,
});

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  if (value === "superAdmin" || value === "admin") {
    return value;
  }

  return "user";
};

const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);

const stripValue = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => stripValue(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const next = {};

    Object.keys(value).forEach((key) => {
      if (removableFields.includes(key)) {
        return;
      }

      const nextValue = stripValue(value[key]);

      if (nextValue !== undefined) {
        next[key] = nextValue;
      }
    });

    return next;
  }

  return value;
};

const sanitizeNoticeData = (noticeData) => {
  const data = {};

  allowedFields.forEach((key) => {
    if (!hasOwn(noticeData, key)) {
      return;
    }

    const value = stripValue(noticeData[key]);

    if (value !== undefined) {
      data[key] = value;
    }
  });

  data.images = Array.isArray(data.images)
    ? data.images
      .filter((image) => image && image.fileID)
      .map((image) => {
        const nextImage = {
          fileID: image.fileID,
          name: image.name || "图片",
        };

        if (image.uploadedAt !== undefined) {
          nextImage.uploadedAt = image.uploadedAt;
        }

        return nextImage;
      })
    : [];

  data.attachments = Array.isArray(data.attachments)
    ? data.attachments
      .filter((attachment) => attachment && attachment.fileID)
      .map((attachment) => {
        const nextAttachment = {
          fileID: attachment.fileID,
          name: attachment.name || "附件",
          size: Number(attachment.size) || 0,
          type: String(attachment.type || "").toLowerCase(),
        };

        if (attachment.uploadedAt !== undefined) {
          nextAttachment.uploadedAt = attachment.uploadedAt;
        }

        return nextAttachment;
      })
    : [];

  data.updatedAt = new Date();

  return data;
};

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const noticeId = String(event.noticeId || "").trim();
    const noticeData = event.noticeData;

    if (!openid) {
      return fail("未获取到用户身份");
    }

    if (!noticeId) {
      return fail("事项信息异常");
    }

    if (!noticeData || typeof noticeData !== "object" || Array.isArray(noticeData)) {
      return fail("事项内容不能为空");
    }

    const invalidField = forbiddenFields.find((field) => hasOwn(noticeData, field));

    if (invalidField) {
      return fail("事项内容包含不可修改字段");
    }

    const userRes = await db.collection("users")
      .where({
        openid,
      })
      .get();
    const users = userRes.data || [];
    const verifiedUsers = users.filter((user) => user.verified === true);
    const isSuperAdmin = verifiedUsers.some((user) => normalizeRole(user.role) === "superAdmin");
    const isAdmin = isSuperAdmin || verifiedUsers.some((user) => normalizeRole(user.role) === "admin");

    if (!isAdmin) {
      return fail("暂无操作权限");
    }

    let notice;

    try {
      const noticeRes = await db.collection("notices")
        .doc(noticeId)
        .get();
      notice = noticeRes.data;
    } catch (error) {
      return fail("事项不存在或已被删除");
    }

    if (!notice) {
      return fail("事项不存在或已被删除");
    }

    const canUpdate = isSuperAdmin || (notice.publisherOpenid && notice.publisherOpenid === openid);

    if (!canUpdate) {
      return fail("暂无操作权限");
    }

    const updateData = sanitizeNoticeData(noticeData);

    try {
      await db.collection("notices")
        .doc(noticeId)
        .update({
          data: updateData,
        });

      const verifyRes = await db.collection("notices")
        .doc(noticeId)
        .get();

      if (!verifyRes.data) {
        return fail("事项不存在或已被删除");
      }

      return success("修改成功");
    } catch (error) {
      console.error("updateNotice update failed", {
        error,
        openid,
        noticeId,
        noticeData,
      });
      return fail("修改失败");
    }
  } catch (error) {
    console.error("updateNotice failed", {
      error,
      event,
    });
    return fail("修改失败");
  }
};
