const normalizeAssistantRole = (role) => {
  const value = String(role || "").trim();

  if (value === "superAdmin" || value === "admin" || value === "guest") {
    return value;
  }

  return "user";
};

const resolveAssistantIdentity = (users) => {
  const records = Array.isArray(users) ? users.filter(Boolean) : [];
  const members = records.filter((user) => user.verified === true);
  const member = members.find((user) => normalizeAssistantRole(user.role) === "superAdmin")
    || members.find((user) => normalizeAssistantRole(user.role) === "admin")
    || members[0];

  if (member) {
    return {
      actor: {
        ...member,
        role: normalizeAssistantRole(member.role) === "guest" ? "user" : normalizeAssistantRole(member.role),
      },
      userType: "member",
      isMember: true,
      isGuest: false,
    };
  }

  const guest = records.find((user) => user.userType === "guest" && user.verified !== true);

  if (guest) {
    return {
      actor: {
        ...guest,
        role: "guest",
      },
      userType: "guest",
      isMember: false,
      isGuest: true,
    };
  }

  return {
    actor: null,
    userType: null,
    isMember: false,
    isGuest: false,
  };
};

const isAssistantUserRateLimitExempt = (role) => normalizeAssistantRole(role) === "superAdmin";

const getAssistantMinuteLimit = (role) => isAssistantUserRateLimitExempt(role) ? Infinity : 10;

const getAssistantDailyLimit = (role) => isAssistantUserRateLimitExempt(role) ? Infinity : 100;

const isRequestOwnedByOther = (request, openid) => Boolean(
  request && request.openid !== openid
);

module.exports = {
  getAssistantDailyLimit,
  getAssistantMinuteLimit,
  isAssistantUserRateLimitExempt,
  isRequestOwnedByOther,
  normalizeAssistantRole,
  resolveAssistantIdentity,
};
