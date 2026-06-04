const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const fail = (message) => ({
  success: false,
  message,
});

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const name = String(event.name || "").trim();
    const studentId = String(event.studentId || "").trim();

    if (!openid) {
      return fail("未获取到用户身份");
    }

    if (!name || !studentId) {
      return fail("请填写姓名和学号");
    }

    const memberRes = await db.collection("class_members")
      .where({
        name,
        studentId,
      })
      .limit(1)
      .get();
    const member = (memberRes.data || [])[0];

    if (!member) {
      return fail("姓名或学号不匹配");
    }

    if (member.boundOpenid && member.boundOpenid !== openid) {
      return fail("该身份已被绑定，请联系管理员");
    }

    const now = new Date();

    await db.collection("class_members")
      .doc(member._id)
      .update({
        data: {
          boundOpenid: openid,
          verified: true,
          verifiedAt: now,
          updatedAt: now,
        },
      });

    const userRes = await db.collection("users")
      .where({
        openid,
      })
      .limit(1)
      .get();
    const user = (userRes.data || [])[0];

    if (user) {
      const userUpdate = {
        name,
        studentId,
        verified: true,
        updatedAt: now,
      };

      if (!user.role) {
        userUpdate.role = "user";
      }

      await db.collection("users")
        .doc(user._id)
        .update({
          data: userUpdate,
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

    return {
      success: true,
      message: "身份验证成功",
      openid,
      name,
      studentId,
    };
  } catch (error) {
    console.error("verifyMember failed", error);
    return fail("验证失败，请稍后重试");
  }
};
