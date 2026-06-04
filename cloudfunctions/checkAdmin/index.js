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
    const isSuperAdmin = users.some((user) => normalizeRole(user.role) === "superAdmin");
    const isRegularAdmin = users.some((user) => normalizeRole(user.role) === "admin");
    const isAdmin = isSuperAdmin || isRegularAdmin;
    const role = isSuperAdmin ? "superAdmin" : (isRegularAdmin ? "admin" : "user");
    const user = users.find((item) => item.verified === true) || users[0] || {};
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
    console.error("checkAdmin failed", error);
    return {
      success: false,
      message: "\u8eab\u4efd\u68c0\u67e5\u5931\u8d25",
    };
  }
};
