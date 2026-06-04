const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const fail = (message) => ({
  success: false,
  message,
});

const success = (message) => ({
  success: true,
  message,
});

const getTargetRole = (role) => (String(role || "").trim() === "superAdmin" ? "superAdmin" : "admin");
const getUserRole = (role) => {
  const value = String(role || "").trim();

  if (value === "superAdmin" || value === "admin") {
    return value;
  }

  return "user";
};

const parseExpireTime = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const inviteCode = String(event.inviteCode || "").trim();

    if (!openid) {
      return fail("请先完成班级身份验证");
    }

    if (!inviteCode) {
      return fail("请输入管理员邀请码");
    }

    const userRes = await db.collection("users")
      .where({
        openid,
      })
      .get();
    const existingUsers = userRes.data || [];
    const existingSuperAdmin = existingUsers.find((user) => getUserRole(user.role) === "superAdmin");
    const existingAdmin = existingUsers.find((user) => getUserRole(user.role) === "admin");
    const existingUser = existingSuperAdmin || existingAdmin || existingUsers[0];
    const name = existingUser ? String(existingUser.name || "").trim() : "";
    const studentId = existingUser ? String(existingUser.studentId || "").trim() : "";

    if (!existingUser || existingUser.verified !== true) {
      return fail("请先完成班级身份验证");
    }

    if (!name || !studentId) {
      return fail("身份信息异常，请重新完成班级身份验证");
    }

    const inviteRes = await db.collection("admin_invite_codes")
      .where({
        code: inviteCode,
        used: false,
      })
      .limit(1)
      .get();

    if (inviteRes.data.length === 0) {
      return fail("邀请码不存在或已被使用");
    }

    const invite = inviteRes.data[0];
    const expiredAt = parseExpireTime(invite.expiredAt);

    if (expiredAt && expiredAt.getTime() < Date.now()) {
      return fail("邀请码不存在或已被使用");
    }

    const targetRole = getTargetRole(invite.role);

    if (existingSuperAdmin) {
      return success("你已是超级管理员");
    }

    if (existingAdmin && targetRole === "admin") {
      return success("你已是管理员");
    }

    const now = new Date();
    const updateRes = await db.collection("admin_invite_codes")
      .where({
        _id: invite._id,
        used: false,
      })
      .update({
        data: {
          used: true,
          usedByOpenid: openid,
          usedByName: name,
          usedByStudentId: studentId,
          usedAt: now,
        },
      });

    if (!updateRes.stats || updateRes.stats.updated !== 1) {
      return fail("邀请码不存在或已被使用");
    }

    await db.collection("users")
      .doc(existingUser._id)
      .update({
        data: {
          openid,
          role: targetRole,
          name,
          studentId,
          verified: true,
          createdAt: existingUser.createdAt || now,
          updatedAt: now,
        },
      });

    return success(targetRole === "superAdmin" ? "超级管理员权限开通成功" : "管理员权限开通成功");
  } catch (error) {
    console.error("applyAdminInvite failed", error);
    return fail("邀请码不存在或已被使用");
  }
};
