const getMemberRole = (role) => {
  const value = String(role || "").trim();

  return value === "admin" || value === "superAdmin" ? value : "user";
};

const pickUserForMemberUpgrade = (users) => {
  const records = Array.isArray(users) ? users.filter(Boolean) : [];

  return records.find((user) => user.verified === true && getMemberRole(user.role) === "superAdmin")
    || records.find((user) => user.verified === true && getMemberRole(user.role) === "admin")
    || records.find((user) => user.verified === true)
    || records.find((user) => user.userType === "guest")
    || records[0];
};

module.exports = {
  getMemberRole,
  pickUserForMemberUpgrade,
};
