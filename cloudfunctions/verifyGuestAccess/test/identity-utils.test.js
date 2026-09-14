const test = require("node:test");
const assert = require("node:assert/strict");
const { getMemberRole, selectGuestTarget } = require("../identity-utils");

test("selects no target when there is no user", () => {
  assert.deepEqual(selectGuestTarget([]), { member: null, target: null });
});

test("reuses an existing guest instead of creating another user", () => {
  const guest = { _id: "guest", userType: "guest", verified: false };
  assert.equal(selectGuestTarget([guest]).target, guest);
});

test("member wins over guest even when guest is first", () => {
  const guest = { _id: "guest", userType: "guest", verified: false };
  const member = { _id: "member", verified: true };
  const result = selectGuestTarget([guest, member]);
  assert.equal(result.member, member);
  assert.equal(result.target, null);
});

test("multiple member records use superAdmin then admin priority", () => {
  const result = selectGuestTarget([
    { _id: "user", verified: true, role: "user" },
    { _id: "admin", verified: true, role: "admin" },
    { _id: "super", verified: true, role: "superAdmin" },
  ]);
  assert.equal(result.member._id, "super");
});

test("member role never leaks a guest role", () => {
  assert.equal(getMemberRole("guest"), "user");
  assert.equal(getMemberRole("admin"), "admin");
  assert.equal(getMemberRole("superAdmin"), "superAdmin");
});
