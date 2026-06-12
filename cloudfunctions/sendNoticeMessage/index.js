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

const truncate = (value, maxLength) => {
  const text = String(value || "").trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength);
};

const parseDeadline = (deadline) => {
  const value = String(deadline || "").trim();
  const match = value.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/
  );

  if (!match) {
    return {
      dateText: "日期待定",
      timeText: "具体时间待定",
    };
  }

  return {
    dateText: `${Number(match[1])}年${Number(match[2])}月${Number(
      match[3]
    )}日`,
    timeText: match[4] || "具体时间待定",
  };
};

const getPendingSubscribers = async () => {
  const subscribers = [];
  const pageSize = 100;
  let skip = 0;

  while (true) {
    const result = await db
      .collection("subscribers")
      .where({
        templateId: subscribeTemplateId,
        used: false,
        enabled: true,
      })
      .skip(skip)
      .limit(pageSize)
      .get();
    const data = result.data || [];

    subscribers.push(...data);

    if (data.length < pageSize) {
      return subscribers;
    }

    skip += pageSize;
  }
};

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const noticeId =
    typeof event.noticeId === "string" ? event.noticeId.trim() : "";

  if (!openid || !noticeId) {
    return {
      success: false,
      message: "缺少必要参数",
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
    const [userResult, noticeResult] = await Promise.all([
      db
        .collection("users")
        .where({
          openid,
          verified: true,
        })
        .limit(1)
        .get(),
      db.collection("notices").doc(noticeId).get(),
    ]);
    const users = userResult.data || [];
    const user =
      users.find((item) => item.role === "superAdmin") ||
      users.find((item) => item.role === "admin");
    const notice = noticeResult.data;
    const isSuperAdmin = Boolean(user && user.role === "superAdmin");
    const isPublisher = Boolean(
      notice && notice.publisherOpenid === openid
    );

    if (!user || !["admin", "superAdmin"].includes(user.role)) {
      return {
        success: false,
        message: "无权发送事项提醒",
      };
    }

    if (!notice || (!isSuperAdmin && !isPublisher)) {
      return {
        success: false,
        message: "无权发送该事项提醒",
      };
    }

    const subscribers = await getPendingSubscribers();

    if (!subscribers.length) {
      return {
        success: true,
        sentCount: 0,
        failCount: 0,
      };
    }

    const { dateText, timeText } = parseDeadline(notice.deadline);
    const title = truncate(notice.title || "班级事项提醒", 20);
    let sentCount = 0;
    let failCount = 0;

    for (const subscriber of subscribers) {
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: subscriber.openid,
          templateId: subscribeTemplateId,
          page: `pages/detail/detail?noticeId=${noticeId}`,
          data: {
            thing1: {
              value: title,
            },
            date2: {
              value: dateText,
            },
            time3: {
              value: timeText,
            },
            thing4: {
              value: "请进入班级盒子查看详情",
            },
          },
        });

        await db.collection("subscribers").doc(subscriber._id).update({
          data: {
            used: true,
            enabled: false,
            usedAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        });
        sentCount += 1;
      } catch (error) {
        safeError("sendNoticeMessage.send", error);
        failCount += 1;
      }
    }

    return {
      success: failCount === 0,
      sentCount,
      failCount,
    };
  } catch (error) {
    safeError("sendNoticeMessage.main", error);
    return {
      success: false,
      message: "发送提醒失败",
    };
  }
};
