const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  return value === "superAdmin" || value === "admin" ? value : "user";
};

const fail = (message) => ({ success: false, message });
const success = (message) => ({ success: true, message });

const getActor = (users) => users.find((user) => normalizeRole(user.role) === "superAdmin")
  || users.find((user) => normalizeRole(user.role) === "admin")
  || users[0]
  || {};

const logSafeError = (action, error) => {
  console.error(action, {
    type: error && error.name ? error.name : "Error",
    code: Number(error && (error.errCode !== undefined ? error.errCode : error.errcode)),
  });
};

const writeOperationLog = async (actor, openid, noticeId, notice) => {
  try {
    await db.collection("operation_logs").add({
      data: {
        openid,
        role: normalizeRole(actor.role),
        action: "delete_notice",
        success: true,
        targetType: "notice",
        targetId: noticeId,
        detail: {
          category: String(notice.category || "").trim(),
          success: true,
        },
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logSafeError("deleteNotice operation log failed", error);
  }
};

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    const noticeId = String(event.noticeId || "").trim();

    if (!openid) return fail("未获取到用户身份");
    if (!noticeId) return fail("事项数据异常");

    const userRes = await db.collection("users")
      .where({
        openid,
        verified: true,
      })
      .get();
    const users = userRes.data || [];
    const actor = getActor(users);
    const isSuperAdmin = users.some((user) => normalizeRole(user.role) === "superAdmin");
    const isAdmin = isSuperAdmin || users.some((user) => normalizeRole(user.role) === "admin");

    if (!isAdmin) return fail("暂无操作权限");

    let notice;

    try {
      const noticeRes = await db.collection("notices").doc(noticeId).get();
      notice = noticeRes.data;
    } catch (error) {
      return fail("事项不存在");
    }

    if (!notice) return fail("事项不存在");

    const canDelete = isSuperAdmin || (notice.publisherOpenid && notice.publisherOpenid === openid);

    if (!canDelete) return fail("暂无操作权限");

    try {
      await db.collection("notices").doc(noticeId).remove();
    } catch (error) {
      logSafeError("deleteNotice remove failed", error);
      return fail("删除失败");
    }

    await writeOperationLog(actor, openid, noticeId, notice);
    return success("删除成功");
  } catch (error) {
    logSafeError("deleteNotice failed", error);
    return fail("删除失败");
  }
};
