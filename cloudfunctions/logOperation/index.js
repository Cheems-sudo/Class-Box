const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const allowedActions = ["pin_notice", "unpin_notice"];

const fail = (message) => ({
  success: false,
  message,
});

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  return value === "superAdmin" || value === "admin" ? value : "user";
};

const getSafeDetail = (detail) => {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return {};
  }

  return {
    pinned: detail.pinned === true,
  };
};

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    const action = String(event.action || "").trim();
    const targetType = String(event.targetType || "").trim();
    const targetId = String(event.targetId || "").trim();
    const targetTitle = String(event.targetTitle || "").trim().slice(0, 30);

    if (!openid) {
      return fail("未获取到用户身份");
    }

    if (!allowedActions.includes(action) || targetType !== "notice" || !targetId) {
      return fail("日志参数无效");
    }

    const userRes = await db.collection("users")
      .where({ openid, verified: true })
      .get();
    const users = userRes.data || [];
    const actor = users.find((user) => normalizeRole(user.role) === "superAdmin")
      || users.find((user) => normalizeRole(user.role) === "admin");

    if (!actor) {
      return fail("暂无操作权限");
    }

    await db.collection("operation_logs").add({
      data: {
        openid,
        name: String(actor.name || "").trim(),
        studentId: String(actor.studentId || "").trim(),
        role: normalizeRole(actor.role),
        action,
        targetType,
        targetId,
        targetTitle,
        detail: getSafeDetail(event.detail),
        createdAt: new Date(),
      },
    });

    return {
      success: true,
      message: "操作日志记录成功",
    };
  } catch (error) {
    console.error("logOperation failed", {
      type: error && error.name ? error.name : "Error",
      code: Number(error && (error.errCode !== undefined ? error.errCode : error.errcode)),
    });
    return fail("操作日志记录失败");
  }
};
