const test = require("node:test");
const assert = require("node:assert/strict");
const { getMemberRole, pickUserForMemberUpgrade } = require("../identity-utils");

test("guest role becomes a regular member role", () => {
  assert.equal(getMemberRole("guest"), "user");
});

test("admin and superAdmin roles are preserved", () => {
  assert.equal(getMemberRole("admin"), "admin");
  assert.equal(getMemberRole("superAdmin"), "superAdmin");
});

test("guest record is selected for in-place member upgrade", () => {
  const guest = { _id: "guest", userType: "guest", role: "guest", verified: false };
  assert.equal(pickUserForMemberUpgrade([guest]), guest);
});

test("existing privileged member takes priority over duplicate guest", () => {
  const guest = { _id: "guest", userType: "guest", role: "guest", verified: false };
  const admin = { _id: "admin", role: "admin", verified: true };
  assert.equal(pickUserForMemberUpgrade([guest, admin]), admin);
});
