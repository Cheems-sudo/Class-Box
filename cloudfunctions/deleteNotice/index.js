const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  if (value === "superAdmin" || value === "admin") {
    return value;
  }

  return "user";
};

const fail = (message) => ({
  success: false,
  message,
});

const success = (message) => ({
  success: true,
  message,
});

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const noticeId = String(event.noticeId || "").trim();

    if (!openid) {
      return fail("未获取到用户身份");
    }

    if (!noticeId) {
      return fail("事项数据异常");
    }

    const userRes = await db.collection("users")
      .where({
        openid,
      })
      .get();
    const users = userRes.data || [];
    const isSuperAdmin = users.some((user) => normalizeRole(user.role) === "superAdmin");
    const isAdmin = isSuperAdmin || users.some((user) => normalizeRole(user.role) === "admin");

    if (!isAdmin) {
      return fail("暂无操作权限");
    }

    let noticeRes;

    try {
      noticeRes = await db.collection("notices")
        .doc(noticeId)
        .get();
    } catch (error) {
      return fail("事项不存在");
    }

    const notice = noticeRes.data;

    if (!notice) {
      return fail("事项不存在");
    }

    const canDelete = isSuperAdmin || (notice.publisherOpenid && notice.publisherOpenid === openid);

    if (!canDelete) {
      return fail("暂无操作权限");
    }

    try {
      await db.collection("notices")
        .doc(noticeId)
        .remove();
    } catch (error) {
      console.error("deleteNotice remove failed", error);
      return fail("删除失败");
    }

    return success("删除成功");
  } catch (error) {
    console.error("deleteNotice failed", error);
    return fail("删除失败");
  }
};
