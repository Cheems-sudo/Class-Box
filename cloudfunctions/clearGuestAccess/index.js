const cloud = require("wx-server-sdk");
const { analyzeGuestRecords, isClearableGuest } = require("./identity-utils");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const fail = (message, errorType) => ({ success: false, message, errorType });

const clearGuestDocument = async (documentId, openid) => db.runTransaction(async (transaction) => {
  let current = null;

  try {
    const result = await transaction.collection("users").doc(documentId).get();
    current = result.data || null;
  } catch (error) {
    return false;
  }

  if (!current || current.openid !== openid || !isClearableGuest(current)) {
    return false;
  }

  await transaction.collection("users").doc(documentId).remove();
  return true;
});

const writeOperationLog = async (openid, clearedCount) => {
  try {
    await db.collection("operation_logs").add({
      data: {
        openid,
        role: "guest",
        action: "clear_guest_access",
        success: true,
        targetType: "user",
        targetId: openid,
        detail: { clearedCount },
        createdAt: new Date(),
      },
    });
  } catch (error) {
    console.error("clearGuestAccess operation log failed", {
      type: error && error.name ? error.name : "Error",
      code: Number(error && (error.errCode !== undefined ? error.errCode : error.errcode)),
    });
  }
};

exports.main = async () => {
  try {
    const openid = cloud.getWXContext().OPENID || "";

    if (!openid) {
      return fail("未获取到用户身份", "auth");
    }

    const userResult = await db.collection("users").where({ openid }).get();
    const analysis = analyzeGuestRecords(userResult.data || []);
    let clearedCount = 0;

    for (const documentId of analysis.guestIds) {
      if (await clearGuestDocument(documentId, openid)) {
        clearedCount += 1;
      }
    }

    if (clearedCount > 0) {
      await writeOperationLog(openid, clearedCount);
    }

    return {
      success: true,
      cleared: clearedCount > 0,
      clearedCount,
      alreadyMember: analysis.alreadyMember,
    };
  } catch (error) {
    console.error("clearGuestAccess failed", {
      type: error && error.name ? error.name : "Error",
      code: Number(error && (error.errCode !== undefined ? error.errCode : error.errcode)),
    });
    return fail("切换身份失败，请稍后重试", "internal");
  }
};
