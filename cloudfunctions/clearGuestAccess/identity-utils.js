const isMemberRecord = (user) => Boolean(user && user.verified === true);

const isClearableGuest = (user) => Boolean(
  user && user.userType === "guest" && user.verified !== true
);

const analyzeGuestRecords = (users) => {
  const records = Array.isArray(users) ? users.filter(Boolean) : [];

  return {
    alreadyMember: records.some(isMemberRecord),
    guestIds: records.filter(isClearableGuest).map((user) => user._id).filter(Boolean),
  };
};

module.exports = {
  analyzeGuestRecords,
  isClearableGuest,
  isMemberRecord,
};
