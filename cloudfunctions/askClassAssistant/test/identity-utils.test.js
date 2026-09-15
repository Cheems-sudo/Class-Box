const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getAssistantDailyLimit,
  getAssistantMinuteLimit,
  isRequestOwnedByOther,
  resolveAssistantIdentity,
} = require("../identity-utils");

test("旧 member 无 userType 时仍允许使用 AI", () => {
  const identity = resolveAssistantIdentity([{ verified: true, role: "user" }]);
  assert.equal(identity.userType, "member");
  assert.equal(identity.actor.role, "user");
});

test("新 member、admin 和 superAdmin 均允许使用 AI", () => {
  assert.equal(resolveAssistantIdentity([{ verified: true, userType: "member", role: "user" }]).actor.role, "user");
  assert.equal(resolveAssistantIdentity([{ verified: true, userType: "member", role: "admin" }]).actor.role, "admin");
  assert.equal(resolveAssistantIdentity([{ verified: true, userType: "member", role: "superAdmin" }]).actor.role, "superAdmin");
});

test("合法 guest 允许使用 AI 并保持 guest 日志角色", () => {
  const identity = resolveAssistantIdentity([{ verified: false, userType: "guest", role: "guest" }]);
  assert.equal(identity.userType, "guest");
  assert.equal(identity.isGuest, true);
  assert.equal(identity.actor.role, "guest");
});

test("无身份、未认证普通脏用户和非法 userType 均被拒绝", () => {
  assert.equal(resolveAssistantIdentity([]).actor, null);
  assert.equal(resolveAssistantIdentity([{ verified: false, role: "user" }]).actor, null);
  assert.equal(resolveAssistantIdentity([{ verified: false, userType: "visitor", role: "user" }]).actor, null);
});

test("member 与 guest 重复时优先最高权限 member", () => {
  const identity = resolveAssistantIdentity([
    { _id: "guest", verified: false, userType: "guest", role: "guest" },
    { _id: "member", verified: true, role: "user" },
    { _id: "admin", verified: true, role: "admin" },
    { _id: "super", verified: true, role: "superAdmin" },
  ]);
  assert.equal(identity.userType, "member");
  assert.equal(identity.actor._id, "super");
  assert.equal(identity.actor.role, "superAdmin");
});

test("普通用户为 3/min、20/day，superAdmin 为 10/min、50/day", () => {
  ["guest", "user", "admin"].forEach((role) => {
    assert.equal(getAssistantMinuteLimit(role), 3);
    assert.equal(getAssistantDailyLimit(role), 20);
  });
  assert.equal(getAssistantMinuteLimit("superAdmin"), 10);
  assert.equal(getAssistantDailyLimit("superAdmin"), 50);
});

test("guest 可以取消自己的请求但不能取消其他 OpenID 的请求", () => {
  assert.equal(isRequestOwnedByOther({ openid: "guest_a" }, "guest_a"), false);
  assert.equal(isRequestOwnedByOther({ openid: "guest_b" }, "guest_a"), true);
});
