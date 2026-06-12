const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const TEXT_REJECTED_MESSAGE = "内容可能不符合规范，请修改后再提交";
const IMAGE_REJECTED_MESSAGE = "图片可能不符合规范，请更换后再提交";
const CHECK_FAILED_MESSAGE = "内容安全检测失败，请稍后重试";

const fail = (message) => ({
  success: false,
  message,
});

const getErrorCode = (value) => {
  const code = value && (value.errCode !== undefined ? value.errCode : value.errcode);

  return Number(code);
};

const getSafeError = (error) => ({
  type: error && error.name ? error.name : "Error",
  code: getErrorCode(error),
  rejected: Boolean(error && error.securityRejected),
});

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
    const error = new Error("Text content security check rejected");
    error.securityRejected = true;
    throw error;
  }

  const errCode = getErrorCode(result);

  if (!Number.isNaN(errCode) && errCode !== 0) {
    const error = new Error("Text content security check failed");
    error.errCode = errCode;
    throw error;
  }
};

const getImageContentType = (fileID) => {
  const normalizedFileID = String(fileID || "").split("?")[0].toLowerCase();

  if (normalizedFileID.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedFileID.endsWith(".gif")) {
    return "image/gif";
  }

  if (normalizedFileID.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
};

const checkImage = async (image) => {
  const fileID = String((image && image.fileID) || "").trim();

  if (!fileID) {
    return;
  }

  const downloadResult = await cloud.downloadFile({
    fileID,
  });
  const result = await cloud.openapi.security.imgSecCheck({
    media: {
      contentType: getImageContentType(fileID),
      value: downloadResult.fileContent,
    },
  });

  if (isRejectedResult(result)) {
    const error = new Error("Image content security check rejected");
    error.securityRejected = true;
    throw error;
  }

  const errCode = getErrorCode(result);

  if (!Number.isNaN(errCode) && errCode !== 0) {
    const error = new Error("Image content security check failed");
    error.errCode = errCode;
    throw error;
  }
};

const getTextItems = (event) => {
  const links = Array.isArray(event.links) ? event.links : [];
  const textItems = [event.title, event.content];

  links.forEach((link) => {
    if (link && typeof link === "object") {
      textItems.push(link.title, link.url);
    }
  });

  return textItems;
};

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return fail("未获取到用户身份");
  }

  try {
    const userRes = await db.collection("users")
      .where({
        openid,
        verified: true,
      })
      .get();
    const canPublish = (userRes.data || []).some((user) => user.role === "admin" || user.role === "superAdmin");

    if (!canPublish) {
      return fail("暂无发布权限");
    }
  } catch (error) {
    console.error("contentSecurityCheck permission check failed", getSafeError(error));
    return fail(CHECK_FAILED_MESSAGE);
  }

  try {
    for (const text of getTextItems(event)) {
      await checkText(text, openid);
    }
  } catch (error) {
    console.error("contentSecurityCheck text check failed", getSafeError(error));
    return fail(error && error.securityRejected ? TEXT_REJECTED_MESSAGE : CHECK_FAILED_MESSAGE);
  }

  try {
    const images = Array.isArray(event.images) ? event.images : [];

    for (const image of images) {
      await checkImage(image);
    }
  } catch (error) {
    console.error("contentSecurityCheck image check failed", getSafeError(error));
    return fail(error && error.securityRejected ? IMAGE_REJECTED_MESSAGE : CHECK_FAILED_MESSAGE);
  }

  return {
    success: true,
    message: "内容安全检测通过",
  };
};
