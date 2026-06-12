const cloud = require("wx-server-sdk");
const { subscribeTemplateId } = require("./config.js");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const safeError = (action, error) => {
  console.error(action, {
    type: error && error.name ? error.name : "Error",
    code: error && error.errCode ? error.errCode : "",
  });
};

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return {
      success: false,
      message: "无法识别当前用户",
    };
  }

  if (
    !subscribeTemplateId ||
    subscribeTemplateId === "YOUR_SUBSCRIBE_TEMPLATE_ID"
  ) {
    return {
      success: false,
      message: "订阅消息模板尚未配置",
    };
  }

  try {
    const userResult = await db
      .collection("users")
      .where({
        openid,
        verified: true,
      })
      .limit(1)
      .get();

    if (!userResult.data || userResult.data.length === 0) {
      return {
        success: false,
        message: "请先完成班级身份认证",
      };
    }

    const existingResult = await db
      .collection("subscribers")
      .where({
        openid,
        templateId: subscribeTemplateId,
        used: false,
        enabled: true,
      })
      .limit(1)
      .get();

    if (existingResult.data && existingResult.data.length > 0) {
      return {
        success: true,
        alreadySubscribed: true,
      };
    }

    await db.collection("subscribers").add({
      data: {
        openid,
        templateId: subscribeTemplateId,
        used: false,
        enabled: true,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });

    return {
      success: true,
      alreadySubscribed: false,
    };
  } catch (error) {
    safeError("saveNoticeSubscriber.main", error);
    return {
      success: false,
      message: "保存订阅状态失败",
    };
  }
};
