const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const maxLength = 300;

const fail = (message) => ({
  success: false,
  message,
});

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  return value === "superAdmin" || value === "admin" ? value : "user";
};

const getErrorCode = (value) => Number(value && (value.errCode !== undefined ? value.errCode : value.errcode));

const getRoleRank = (role) => {
  const value = normalizeRole(role);

  if (value === "superAdmin") {
    return 3;
  }

  if (value === "admin") {
    return 2;
  }

  return 1;
};

const getTime = (value) => {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const pickVerifiedUser = (users) => {
  return (users || [])
    .filter((user) => user && user.verified === true)
    .sort((left, right) => {
      const roleDiff = getRoleRank(right.role) - getRoleRank(left.role);

      if (roleDiff !== 0) {
        return roleDiff;
      }

      return getTime(right.updatedAt || right.createdAt) - getTime(left.updatedAt || left.createdAt);
    })[0] || null;
};

const logSafeError = (action, error) => {
  console.error(action, {
    type: error && error.name ? error.name : "Error",
    code: getErrorCode(error),
    rejected: Boolean(error && error.securityRejected),
  });
};

const isRejectedResult = (result) => {
  const suggest = result && result.result && result.result.suggest;

  return suggest === "risky" || suggest === "review" || getErrorCode(result) === 87014;
};

const checkText = async (content, openid) => {
  const result = await cloud.openapi.security.msgSecCheck({
    content,
    version: 2,
    scene: 2,
    openid,
  });

  if (isRejectedResult(result)) {
    const error = new Error("Content rejected");
    error.securityRejected = true;
    throw error;
  }

  const errCode = getErrorCode(result);

  if (!Number.isNaN(errCode) && errCode !== 0) {
    const error = new Error("Content check failed");
    error.errCode = errCode;
    throw error;
  }
};

const buildCounter = (openid, action, windowMs) => {
  const bucketStart = Math.floor(Date.now() / windowMs) * windowMs;
  const safeOpenid = openid.replace(/[^a-zA-Z0-9_-]/g, "_");
  const id = `${action}_${safeOpenid}_${bucketStart}`;

  return {
    id,
    openid,
    action,
    windowStart: new Date(bucketStart),
    windowMs,
    expiresAt: new Date(bucketStart + windowMs * 2),
  };
};

const consumeFeedbackRateLimit = async (openid) => {
  const counters = [
    {
      ...buildCounter(openid, "submit_feedback", 60 * 1000),
      limit: 1,
    },
    {
      ...buildCounter(openid, "submit_feedback_daily", 24 * 60 * 60 * 1000),
      limit: 10,
    },
  ];

  return db.runTransaction(async (transaction) => {
    const existingCounters = [];

    for (const item of counters) {
      try {
        const result = await transaction
          .collection("security_counters")
          .doc(item.id)
          .get();
        existingCounters.push(result.data || null);
      } catch (error) {
        existingCounters.push(null);
      }
    }

    const rejected = counters.some((item, index) => {
      const count = Number(existingCounters[index] && existingCounters[index].count) || 0;
      return count >= item.limit;
    });

    if (rejected) {
      return false;
    }

    const now = new Date();

    for (const [index, item] of counters.entries()) {
      const counter = existingCounters[index];
      const count = Number(counter && counter.count) || 0;
      const data = {
        openid: item.openid,
        action: item.action,
        count: count + 1,
        windowStart: item.windowStart,
        windowMs: item.windowMs,
        updatedAt: now,
        expiresAt: item.expiresAt,
      };

      if (counter) {
        await transaction
          .collection("security_counters")
          .doc(item.id)
          .update({ data });
      } else {
        await transaction
          .collection("security_counters")
          .doc(item.id)
          .set({
            data: {
              ...data,
              createdAt: now,
            },
          });
      }
    }

    return true;
  });
};

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    const content = String(event.content || "").trim();

    if (!openid) {
      return fail("请先登录后再提交");
    }

    if (!content) {
      return fail("请输入反馈内容");
    }

    if (content.length < 2) {
      return fail("反馈内容至少 2 个字");
    }

    if (content.length > maxLength) {
      return fail("反馈内容不能超过 300 字");
    }

    const userResult = await db
      .collection("users")
      .where({
        openid,
      })
      .get();
    const user = pickVerifiedUser(userResult.data);

    if (!user) {
      return fail("请先完成班级身份验证");
    }

    const allowed = await consumeFeedbackRateLimit(openid);

    if (!allowed) {
      return fail("提交过于频繁，请稍后再试");
    }

    try {
      await checkText(content, openid);
    } catch (error) {
      if (error && error.securityRejected) {
        return fail("反馈内容包含不合规内容，请修改后再提交");
      }

      throw error;
    }

    const now = db.serverDate();
    const addResult = await db.collection("feedbacks").add({
      data: {
        openid,
        userName: user.name || "",
        studentId: user.studentId || "",
        role: normalizeRole(user.role),
        content,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      },
    });

    return {
      success: true,
      id: addResult._id,
    };
  } catch (error) {
    logSafeError("submitFeedback failed", error);
    return fail("提交失败，请稍后重试");
  }
};
