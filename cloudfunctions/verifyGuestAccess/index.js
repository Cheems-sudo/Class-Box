const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const { getMemberRole, selectGuestTarget } = require("./identity-utils");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const fail = (message, errorType) => ({ success: false, message, errorType });
const hashAccessCode = (code) => crypto.createHash("sha256").update(code, "utf8").digest("hex");
const getGuestDocumentId = (openid) => `guest_${hashAccessCode(openid).slice(0, 48)}`;

const updateGuestDocument = async (target, openid, now) => db.runTransaction(async (transaction) => {
  let current = null;

  try {
    const result = await transaction.collection("users").doc(target._id).get();
    current = result.data || null;
  } catch (error) {
    current = null;
  }

  if (current && current.openid === openid && current.verified === true) {
    return { alreadyMember: true, member: current };
  }

  if (!current || current.openid !== openid) {
    return { retryRequired: true };
  }

  await transaction.collection("users").doc(target._id).update({
    data: {
      openid,
      userType: "guest",
      role: "guest",
      verified: false,
      updatedAt: now,
    },
  });
  return { alreadyMember: false };
});

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID || "";
    const accessCode = String(event.accessCode || "").trim();

    if (!openid) {
      return fail("未获取到用户身份", "auth");
    }

    if (!accessCode) {
      return fail("请输入访问码", "input_empty");
    }

    if (accessCode.length > 128) {
      return fail("访问码无效", "invalid_code");
    }

    const codeHash = hashAccessCode(accessCode);
    const codeResult = await db.collection("guest_access_codes")
      .where({ codeHash, enabled: true })
      .limit(1)
      .get();

    if (!codeResult.data || codeResult.data.length === 0) {
      return fail("访问码无效", "invalid_code");
    }

    const userResult = await db.collection("users")
      .where({ openid })
      .get();
    const { member, target } = selectGuestTarget(userResult.data || []);

    if (member) {
      return {
        success: true,
        openid,
        verified: true,
        userType: "member",
        role: getMemberRole(member.role),
        isMember: true,
        isGuest: false,
        alreadyMember: true,
      };
    }

    const now = new Date();

    if (target) {
      const updateResult = await updateGuestDocument(target, openid, now);

      if (updateResult.alreadyMember) {
        return {
          success: true,
          openid,
          verified: true,
          userType: "member",
          role: getMemberRole(updateResult.member.role),
          isMember: true,
          isGuest: false,
          alreadyMember: true,
        };
      }

      if (updateResult.retryRequired) {
        return fail("身份状态已变化，请重试", "identity_changed");
      }
    } else {
      await db.collection("users").doc(getGuestDocumentId(openid)).set({
        data: {
          openid,
          userType: "guest",
          role: "guest",
          verified: false,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    return {
      success: true,
      openid,
      verified: false,
      userType: "guest",
      role: "guest",
      isMember: false,
      isGuest: true,
      alreadyMember: false,
    };
  } catch (error) {
    console.error("verifyGuestAccess failed", {
      type: error && error.name ? error.name : "Error",
      code: Number(error && (error.errCode !== undefined ? error.errCode : error.errcode)),
    });
    return fail("访客身份验证失败，请稍后重试", "internal");
  }
};

module.exports.hashAccessCode = hashAccessCode;
module.exports.getGuestDocumentId = getGuestDocumentId;
