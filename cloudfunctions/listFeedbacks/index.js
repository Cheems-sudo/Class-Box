const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;
const defaultPageSize = 50;
const maxPageSize = 50;

const fail = (message) => ({
  success: false,
  message,
});

const normalizeRole = (role) => {
  const value = String(role || "").trim();

  return value === "superAdmin" || value === "admin" ? value : "user";
};

const getErrorCode = (value) => Number(value && (value.errCode !== undefined ? value.errCode : value.errcode));

const logSafeError = (action, error) => {
  console.error(action, {
    type: error && error.name ? error.name : "Error",
    code: getErrorCode(error),
  });
};

const normalizeDate = (value) => {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const parseCursor = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const date = new Date(value.createdAt);
  const id = String(value.id || "").trim();

  if (Number.isNaN(date.getTime()) || !id) {
    return null;
  }

  return {
    createdAt: date,
    id,
  };
};

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;

    if (!openid) {
      return fail("未获取到用户身份");
    }

    const userResult = await db
      .collection("users")
      .where({
        openid,
      })
      .get();
    const users = userResult.data || [];
    const verifiedUsers = users.filter((user) => user.verified === true);

    if (!verifiedUsers.length) {
      return fail("请先完成班级身份验证");
    }

    const isSuperAdmin = verifiedUsers.some((user) => normalizeRole(user.role) === "superAdmin");

    if (!isSuperAdmin) {
      return fail("暂无查看权限");
    }

    const pageSize = Math.min(Math.max(Number(event.pageSize) || defaultPageSize, 1), maxPageSize);
    const cursor = parseCursor(event.cursor);
    let collection = db.collection("feedbacks");

    if (cursor) {
      collection = collection.where(_.or([
        {
          createdAt: _.lt(cursor.createdAt),
        },
        {
          createdAt: cursor.createdAt,
          _id: _.lt(cursor.id),
        },
      ]));
    }

    const result = await collection
      .field({
        _id: true,
        userName: true,
        content: true,
        createdAt: true,
      })
      .orderBy("createdAt", "desc")
      .orderBy("_id", "desc")
      .limit(pageSize + 1)
      .get();
    const rows = result.data || [];
    const list = rows.slice(0, pageSize).map((item) => ({
      id: item._id,
      userName: String(item.userName || "匿名用户"),
      content: String(item.content || ""),
      createdAt: normalizeDate(item.createdAt),
    }));
    const lastItem = list[list.length - 1];

    return {
      success: true,
      list,
      hasMore: rows.length > pageSize,
      nextCursor: lastItem
        ? {
            createdAt: lastItem.createdAt,
            id: lastItem.id,
          }
        : null,
    };
  } catch (error) {
    logSafeError("listFeedbacks failed", error);
    return fail("反馈加载失败，请稍后重试");
  }
};
