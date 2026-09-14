const normalizeRole = (role) => {
  const value = String(role || "").trim();

  if (value === "superAdmin" || value === "admin") {
    return value;
  }

  return "user";
};

const resolveIdentity = (users) => {
  const records = Array.isArray(users) ? users.filter(Boolean) : [];
  const members = records.filter((user) => user.verified === true);
  const isSuperAdmin = members.some((user) => normalizeRole(user.role) === "superAdmin");
  const isRegularAdmin = members.some((user) => normalizeRole(user.role) === "admin");
  const isAdmin = isSuperAdmin || isRegularAdmin;
  const member = members.find((user) => normalizeRole(user.role) === "superAdmin")
    || members.find((user) => normalizeRole(user.role) === "admin")
    || members[0];

  if (member) {
    return {
      user: member,
      verified: true,
      userType: "member",
      isMember: true,
      isGuest: false,
      isAdmin,
      isSuperAdmin,
      role: isSuperAdmin ? "superAdmin" : (isRegularAdmin ? "admin" : "user"),
    };
  }

  const guest = records.find((user) => user.userType === "guest");

  if (guest) {
    return {
      user: guest,
      verified: false,
      userType: "guest",
      isMember: false,
      isGuest: true,
      isAdmin: false,
      isSuperAdmin: false,
      role: "guest",
    };
  }

  return {
    user: records[0] || {},
    verified: false,
    userType: null,
    isMember: false,
    isGuest: false,
    isAdmin: false,
    isSuperAdmin: false,
    role: "user",
  };
};

module.exports = {
  normalizeRole,
  resolveIdentity,
};
