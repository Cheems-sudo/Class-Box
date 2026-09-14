const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveIdentity } = require("../identity-utils");

test("legacy verified user is treated as member", () => {
  const result = resolveIdentity([{ verified: true, role: "user", name: "A" }]);
  assert.equal(result.verified, true);
  assert.equal(result.userType, "member");
  assert.equal(result.isMember, true);
  assert.equal(result.isGuest, false);
});

test("guest remains unverified and is never admin", () => {
  const result = resolveIdentity([{ verified: false, userType: "guest", role: "guest" }]);
  assert.equal(result.verified, false);
  assert.equal(result.userType, "guest");
  assert.equal(result.isMember, false);
  assert.equal(result.isGuest, true);
  assert.equal(result.isAdmin, false);
  assert.equal(result.isSuperAdmin, false);
  assert.equal(result.role, "guest");
});

test("verified member wins over a duplicate guest record", () => {
  const result = resolveIdentity([
    { verified: false, userType: "guest", role: "guest" },
    { verified: true, role: "admin" },
  ]);
  assert.equal(result.userType, "member");
  assert.equal(result.role, "admin");
  assert.equal(result.isAdmin, true);
});

test("user without an identity remains unauthenticated", () => {
  const result = resolveIdentity([]);
  assert.equal(result.userType, null);
  assert.equal(result.verified, false);
  assert.equal(result.role, "user");
});
