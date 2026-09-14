const selectGuestTarget = (users) => {
  const records = Array.isArray(users) ? users.filter(Boolean) : [];
  const members = records.filter((user) => user.verified === true);
  const member = members.find((user) => getMemberRole(user.role) === "superAdmin")
    || members.find((user) => getMemberRole(user.role) === "admin")
    || members[0];

  if (member) {
    return { member, target: null };
  }

  return {
    member: null,
    target: records.find((user) => user.userType === "guest") || records[0] || null,
  };
};

const getMemberRole = (role) => {
  const value = String(role || "").trim();

  return value === "admin" || value === "superAdmin" ? value : "user";
};

module.exports = {
  getMemberRole,
  selectGuestTarget,
};
