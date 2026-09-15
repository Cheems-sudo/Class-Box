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

const getAssistantMinuteLimit = (role) => normalizeAssistantRole(role) === "superAdmin" ? 10 : 3;

const getAssistantDailyLimit = (role) => normalizeAssistantRole(role) === "superAdmin" ? 50 : 20;

const isRequestOwnedByOther = (request, openid) => Boolean(
  request && request.openid !== openid
);

module.exports = {
  getAssistantDailyLimit,
  getAssistantMinuteLimit,
  isRequestOwnedByOther,
  normalizeAssistantRole,
  resolveAssistantIdentity,
};
