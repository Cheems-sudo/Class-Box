// 云函数说明：封装 index 相关的服务端校验与数据处理流程。
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const inviteAttemptWindow = 10 * 60 * 1000;
const maxInviteAttempts = 5;

const fail = (message) => ({ success: false, message });
const success = (message) => ({ success: true, message });

const getTargetRole = (role) => (String(role || "").trim() === "superAdmin" ? "superAdmin" : "admin");
const getUserRole = (role) => {
  const value = String(role || "").trim();

  return value === "superAdmin" || value === "admin" ? value : "user";
};

const getCodePrefix = (inviteCode) => {
  const value = String(inviteCode || "").trim().toUpperCase();

  if (value.startsWith("SUPER-")) return "SUPER-";
  if (value.startsWith("BW-")) return "BW-";
  if (value.startsWith("ADMIN-")) return "ADMIN-";
  return "OTHER";
};

const logSafeError = (action, error) => {
  console.error(action, {
    type: error && error.name ? error.name : "Error",
    code: Number(error && (error.errCode !== undefined ? error.errCode : error.errcode)),
  });
};

// 在事务中消费操作配额，防止并发请求绕过频率限制。
const consumeInviteAttempt = async (openid) => {
  const action = "apply_admin_attempt";
  const bucketStart =
    Math.floor(Date.now() / inviteAttemptWindow) * inviteAttemptWindow;
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

    if (count >= maxInviteAttempts) {
      return false;
    }

    const now = new Date();
    const data = {
      openid,
      action,
      count: count + 1,
      windowStart: new Date(bucketStart),
      windowMs: inviteAttemptWindow,
      updatedAt: now,
      expiresAt: new Date(bucketStart + inviteAttemptWindow * 2),
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

// 记录审计或辅助数据；记录失败不应掩盖主业务结果。
const writeOperationLog = async (actor, data) => {
  try {
    await db.collection("operation_logs").add({
      data: {
        openid: actor.openid,
        role: data.role || getUserRole(actor.role),
        action: "apply_admin",
        success: data.success === true,
        targetType: "user",
        targetId: actor.openid,
        detail: {
          codePrefix: data.codePrefix,
          requestedRole: data.requestedRole || "",
          success: data.success === true,
          reason: data.reason,
        },
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logSafeError("applyAdminInvite operation log failed", error);
  }
};

const recordInviteFailure = async (actor, inviteCode, reason, requestedRole = "") => {
  const codePrefix = getCodePrefix(inviteCode);

  await writeOperationLog(actor, {
    codePrefix,
    requestedRole,
    success: false,
    reason,
  });
};

const parseExpireTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

// 集中编排参数校验、权限控制、数据操作和异常响应。
exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    const inviteCode = String(event.inviteCode || "").trim();

    if (!openid) {
      return fail("请先完成班级身份验证");
    }

    const userRes = await db.collection("users")
      .where({ openid })
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

    const actor = {
      openid,
      name,
      studentId,
      role: existingUser.role,
    };

    try {
      const allowed = await consumeInviteAttempt(openid);

      if (!allowed) {
        return fail("尝试次数过多，请稍后再试");
      }
    } catch (error) {
      logSafeError("applyAdminInvite counter write failed", error);
      return fail("邀请码校验失败，请稍后再试");
    }

    if (!inviteCode) {
      await recordInviteFailure(actor, inviteCode, "invalid_format");
      return fail("邀请码不存在或已被使用");
    }

    const inviteRes = await db.collection("admin_invite_codes")
      .where({ code: inviteCode, used: false })
      .limit(1)
      .get();

    if (inviteRes.data.length === 0) {
      await recordInviteFailure(actor, inviteCode, "not_found_or_used");
      return fail("邀请码不存在或已被使用");
    }

    const invite = inviteRes.data[0];
    const targetRole = getTargetRole(invite.role);
    const expiredAt = parseExpireTime(invite.expiredAt);

    if (expiredAt && expiredAt.getTime() < Date.now()) {
      await recordInviteFailure(actor, inviteCode, "expired", targetRole);
      return fail("邀请码不存在或已被使用");
    }

    if (existingSuperAdmin) {
      return success("你已是超级管理员");
    }

    if (existingAdmin && targetRole === "admin") {
      return success("你已是管理员");
    }

    const now = new Date();
    const updateRes = await db.collection("admin_invite_codes")
      .where({ _id: invite._id, used: false })
      .update({
        data: {
          used: true,
          usedByOpenid: openid,
          usedAt: now,
        },
      });

    if (!updateRes.stats || updateRes.stats.updated !== 1) {
      await recordInviteFailure(actor, inviteCode, "not_found_or_used", targetRole);
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

    await writeOperationLog(actor, {
      codePrefix: getCodePrefix(inviteCode),
      requestedRole: targetRole,
      role: targetRole,
      success: true,
      reason: "granted",
    });

    return success(targetRole === "superAdmin" ? "超级管理员权限开通成功" : "管理员权限开通成功");
  } catch (error) {
    logSafeError("applyAdminInvite failed", error);
    return fail("邀请码不存在或已被使用");
  }
};
