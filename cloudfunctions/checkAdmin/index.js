// 云函数说明：封装 index 相关的服务端校验与数据处理流程。
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const { resolveIdentity } = require("./identity-utils");

// 集中编排参数校验、权限控制、数据操作和异常响应。
exports.main = async () => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    const adminRes = await db.collection("users")
      .where({
        openid,
      })
      .get();

    const identity = resolveIdentity(adminRes.data || []);
    const { user, verified, userType, isMember, isGuest, isAdmin, isSuperAdmin, role } = identity;

    return {
      success: true,
      openid,
      isAdmin,
      isSuperAdmin,
      role,
      verified,
      userType,
      isMember,
      isGuest,
      name: verified ? (user.name || "") : "",
      studentId: verified ? (user.studentId || "") : "",
    };
  } catch (error) {
    console.error("checkAdmin failed", {
      type: error && error.name ? error.name : "Error",
      code: Number(
        error &&
          (error.errCode !== undefined ? error.errCode : error.errcode)
      ),
    });
    return {
      success: false,
      message: "\u8eab\u4efd\u68c0\u67e5\u5931\u8d25",
    };
  }
};
