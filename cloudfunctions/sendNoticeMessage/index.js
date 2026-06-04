const cloud = require("wx-server-sdk");
const config = require("./config.js");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const templateId = config.subscribeTemplateId;
const pendingTimeText = "具体时间待定";
const remarkText = "请进入班级盒子查看详情";

const truncate = (value, maxLength) => {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength);
};

const parseDeadline = (deadline) => {
  const value = String(deadline || "").trim();
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/);

  if (!match) {
    return {
      dateText: "",
      timeText: pendingTimeText,
    };
  }

  return {
    dateText: `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`,
    timeText: match[4] || pendingTimeText,
  };
};

const getPendingSubscribers = async () => {
  const subscribers = [];
  const pageSize = 100;
  let skip = 0;

  while (true) {
    const res = await db.collection("subscribers")
      .where({
        templateId,
        used: false,
        enabled: true,
      })
      .skip(skip)
      .limit(pageSize)
      .get();
    const data = res.data || [];

    subscribers.push(...data);

    if (data.length < pageSize) {
      break;
    }

    skip += pageSize;
  }

  return subscribers;
};

exports.main = async (event = {}) => {
  const subscribers = await getPendingSubscribers();

  if (!subscribers.length) {
    return {
      success: true,
      message: "暂无订阅用户",
      sentCount: 0,
    };
  }

  const { dateText, timeText } = parseDeadline(event.deadline);
  const noticeTitle = truncate(event.title || "班级事项提醒", 20);
  const noticeDate = dateText || "日期待定";
  let sentCount = 0;
  let failCount = 0;

  for (const subscriber of subscribers) {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: subscriber.openid,
        templateId,
        page: event.noticeId ? `pages/detail/detail?id=${event.noticeId}` : "pages/index/index",
        data: {
          thing1: {
            value: noticeTitle,
          },
          date2: {
            value: noticeDate,
          },
          time3: {
            value: timeText,
          },
          thing4: {
            value: truncate(remarkText, 20),
          },
        },
      });

      await db.collection("subscribers").doc(subscriber._id).update({
        data: {
          used: true,
          updatedAt: new Date(),
        },
      });

      sentCount += 1;
    } catch (error) {
      failCount += 1;
      console.error("发送订阅消息失败", subscriber.openid, error);
    }
  }

  return {
    success: true,
    sentCount,
    failCount,
  };
};
