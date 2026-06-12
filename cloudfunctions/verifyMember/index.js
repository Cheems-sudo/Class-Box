const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const fail = (message) => ({ success: false, message });

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

const writeOperationLog = async (openid, role) => {
  try {
    await db.collection("operation_logs").add({
      data: {
        openid,
        role: normalizeRole(role),
        action: "verify_member",
        success: true,
        targetType: "user",
        targetId: openid,
        detail: {
          success: true,
        },
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logSafeError("verifyMember operation log failed", error);
  }
};

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    const name = String(event.name || "").trim();
    const studentId = String(event.studentId || "").trim();

    if (!openid) return fail("未获取到用户身份");
    if (!name || !studentId) return fail("请填写姓名和学号");

    const memberRes = await db.collection("class_members")
      .where({ name, studentId })
      .limit(1)
      .get();
    const member = (memberRes.data || [])[0];

    if (!member) return fail("姓名或学号不匹配");
    const now = new Date();

    try {
      await db.runTransaction(async (transaction) => {
        const currentResult = await transaction
          .collection("class_members")
          .doc(member._id)
          .get();
        const currentMember = currentResult.data;

        if (
          !currentMember ||
          (currentMember.boundOpenid &&
            currentMember.boundOpenid !== openid)
        ) {
          const bindingError = new Error("MEMBER_ALREADY_BOUND");
          bindingError.bindingRejected = true;
          throw bindingError;
        }

        await transaction
          .collection("class_members")
          .doc(member._id)
          .update({
            data: {
              boundOpenid: openid,
              verified: true,
              verifiedAt: now,
              updatedAt: now,
            },
          });
      });
    } catch (error) {
      if (
        error &&
        (error.bindingRejected || error.message === "MEMBER_ALREADY_BOUND")
      ) {
        return fail("该身份已被绑定，请联系管理员");
      }

      throw error;
    }

    const userRes = await db.collection("users")
      .where({ openid })
      .limit(1)
      .get();
    const user = (userRes.data || [])[0];

    if (user) {
      await db.collection("users")
        .doc(user._id)
        .update({
          data: {
            name,
            studentId,
            verified: true,
            role: user.role || "user",
            updatedAt: now,
          },
        });
    } else {
      await db.collection("users").add({
        data: {
          openid,
          name,
          studentId,
          role: "user",
          verified: true,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    await writeOperationLog(openid, user && user.role);

    return {
      success: true,
      message: "身份验证成功",
      openid,
      name,
      studentId,
    };
  } catch (error) {
    logSafeError("verifyMember failed", error);
    return fail("验证失败，请稍后重试");
  }
};
