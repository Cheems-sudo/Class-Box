const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const fail = (message) => ({
  success: false,
  message,
});

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  return value === "superAdmin" || value === "admin" ? value : "user";
};

const logSafeError = (action, error) => {
  console.error(action, {
    type: error && error.name ? error.name : "Error",
    code: Number(error && (error.errCode !== undefined ? error.errCode : error.errcode)),
  });
};

const getActor = (users) => users.find((user) => normalizeRole(user.role) === "superAdmin")
  || users.find((user) => normalizeRole(user.role) === "admin")
  || users[0]
  || {};

const writeOperationLog = async (actor, openid, noticeId, notice, pinned) => {
  try {
    await db.collection("operation_logs").add({
      data: {
        openid,
        role: normalizeRole(actor.role),
        action: pinned ? "pin_notice" : "unpin_notice",
        success: true,
        targetType: "notice",
        targetId: noticeId,
        detail: {
          pinned,
          success: true,
        },
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logSafeError("updateNoticePin operation log failed", error);
  }
};

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    const noticeId = String(event.noticeId || "").trim();
    const pinned = event.pinned === true;

    if (!openid) {
      return fail("未获取到用户身份");
    }

    if (!noticeId) {
      return fail("事项信息异常");
    }

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

    if (!isAdmin) {
      return fail("暂无操作权限");
    }

    let notice;

    try {
      const noticeRes = await db.collection("notices").doc(noticeId).get();
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

    await db.collection("notices")
      .doc(noticeId)
      .update({
        data: {
          pinned,
          isPinned: pinned,
          updatedAt: new Date(),
        },
      });

    await writeOperationLog(actor, openid, noticeId, notice, pinned);

    return {
      success: true,
      message: pinned ? "已置顶" : "已取消置顶",
      pinned,
    };
  } catch (error) {
    logSafeError("updateNoticePin failed", error);
    return fail("操作失败");
  }
};
