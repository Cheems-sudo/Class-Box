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

exports.main = async () => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    const adminRes = await db.collection("users")
      .where({
        openid,
      })
      .get();

    const users = adminRes.data || [];
    const verifiedUsers = users.filter((item) => item.verified === true);
    const isSuperAdmin = verifiedUsers.some(
      (user) => normalizeRole(user.role) === "superAdmin"
    );
    const isRegularAdmin = verifiedUsers.some(
      (user) => normalizeRole(user.role) === "admin"
    );
    const isAdmin = isSuperAdmin || isRegularAdmin;
    const role = isSuperAdmin ? "superAdmin" : (isRegularAdmin ? "admin" : "user");
    const user = verifiedUsers[0] || users[0] || {};
    const verified = user.verified === true;

    return {
      success: true,
      openid,
      isAdmin,
      isSuperAdmin,
      role,
      verified,
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
