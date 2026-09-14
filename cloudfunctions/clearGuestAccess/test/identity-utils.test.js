const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeGuestRecords, isClearableGuest } = require("../identity-utils");

test("纯 guest 记录会成为清理目标", () => {
  const result = analyzeGuestRecords([
    { _id: "guest", userType: "guest", role: "guest", verified: false },
  ]);
  assert.deepEqual(result, { alreadyMember: false, guestIds: ["guest"] });
});

test("member 调用时不会成为清理目标", () => {
  const member = { _id: "member", userType: "member", role: "admin", verified: true };
  const result = analyzeGuestRecords([member]);
  assert.deepEqual(result, { alreadyMember: true, guestIds: [] });
  assert.equal(isClearableGuest(member), false);
});

test("member 与 guest 重复时只清理 guest", () => {
  const result = analyzeGuestRecords([
    { _id: "member", verified: true, role: "superAdmin" },
    { _id: "guest-a", userType: "guest", verified: false },
    { _id: "guest-b", userType: "guest" },
    { _id: "dirty", verified: false, role: "user" },
  ]);
  assert.deepEqual(result, {
    alreadyMember: true,
    guestIds: ["guest-a", "guest-b"],
  });
});

test("重复调用分析无 guest 时保持幂等", () => {
  assert.deepEqual(analyzeGuestRecords([]), { alreadyMember: false, guestIds: [] });
  assert.deepEqual(analyzeGuestRecords([{ verified: false, role: "user" }]), {
    alreadyMember: false,
    guestIds: [],
  });
});
