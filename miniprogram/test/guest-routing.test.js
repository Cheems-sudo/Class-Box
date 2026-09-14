const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { redirectGuestToAssistant } = require("../utils/identity");

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const loadPage = (relativePath, identity) => {
  let definition;
  const calls = [];
  let databaseReads = 0;
  const routes = [];

  global.Page = (value) => { definition = value; };
  global.wx = {
    cloud: {
      callFunction(options) {
        calls.push(options.name);
        return Promise.resolve({ result: identity });
      },
      database() {
        databaseReads += 1;
        throw new Error("guest must not access the database");
      },
    },
    reLaunch(options) { routes.push(options.url); },
    showToast() {},
    showLoading() {},
    hideLoading() {},
    showModal(options) { options.success({ confirm: true, cancel: false }); },
    stopPullDownRefresh() {},
  };

  const modulePath = path.resolve(__dirname, relativePath);
  delete require.cache[modulePath];
  require(modulePath);

  const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(values, callback) {
      Object.assign(this.data, values);
      if (callback) callback();
    },
  };

  return { page, calls, routes, getDatabaseReads: () => databaseReads };
};

test("轻量路由工具只重定向 guest，并防止重复导航", () => {
  const routes = [];
  global.wx = {
    reLaunch(options) { routes.push(options.url); },
    showToast() {},
  };
  const page = {};

  assert.equal(redirectGuestToAssistant({ isGuest: false }, page), false);
  assert.equal(redirectGuestToAssistant({ isGuest: true }, page), true);
  assert.equal(redirectGuestToAssistant({ isGuest: true }, page), true);
  assert.deepEqual(routes, ["/pages/class-assistant/class-assistant"]);
});

test("guest 直达首页时不读取 notices 并转到 AI", async () => {
  const context = loadPage("../pages/index/index.js", { success: true, isGuest: true, verified: false });
  context.page.onLoad();
  await flushPromises();

  assert.deepEqual(context.calls, ["checkAdmin"]);
  assert.equal(context.getDatabaseReads(), 0);
  assert.deepEqual(context.routes, ["/pages/class-assistant/class-assistant"]);
});

test("guest 直达详情时不读取 notice 并转到 AI", async () => {
  const context = loadPage("../pages/detail/detail.js", { success: true, isGuest: true, verified: false });
  context.page.onLoad({ id: "notice-secret" });
  await flushPromises();

  assert.deepEqual(context.calls, ["checkAdmin"]);
  assert.equal(context.getDatabaseReads(), 0);
  assert.deepEqual(context.routes, ["/pages/class-assistant/class-assistant"]);
});

test("guest 直达反馈管理时不会调用 listFeedbacks", async () => {
  const context = loadPage("../pages/feedback-admin/feedback-admin.js", { success: true, isGuest: true, verified: false });
  context.page.onLoad();
  await flushPromises();

  assert.deepEqual(context.calls, ["checkAdmin"]);
  assert.deepEqual(context.routes, ["/pages/class-assistant/class-assistant"]);
});

test("guest 直达其他受限页面时均只检查身份并转到 AI", async () => {
  const cases = [
    { path: "../pages/publish/publish.js", start: (page) => page.onLoad({}) },
    { path: "../pages/my/my.js", start: (page) => page.onShow() },
    { path: "../pages/favorites/favorites.js", start: (page) => page.onLoad() },
    { path: "../pages/my-posts/my-posts.js", start: (page) => page.onLoad() },
    { path: "../pages/admin-auth/admin-auth.js", start: (page) => page.onLoad() },
    { path: "../pages/feedback/feedback.js", start: (page) => page.onShow() },
  ];

  for (const item of cases) {
    const context = loadPage(item.path, { success: true, isGuest: true, verified: false });
    item.start(context.page);
    await flushPromises();

    assert.deepEqual(context.calls, ["checkAdmin"], item.path);
    assert.equal(context.getDatabaseReads(), 0, item.path);
    assert.deepEqual(context.routes, ["/pages/class-assistant/class-assistant"], item.path);
  }
});

test("所有受限业务页均接入 guest 路由，成员认证页保持允许", () => {
  const restrictedPages = [
    "publish/publish.js",
    "my/my.js",
    "detail/detail.js",
    "favorites/favorites.js",
    "my-posts/my-posts.js",
    "admin-auth/admin-auth.js",
    "feedback/feedback.js",
    "feedback-admin/feedback-admin.js",
  ];

  restrictedPages.forEach((pagePath) => {
    const source = fs.readFileSync(path.resolve(__dirname, "../pages", pagePath), "utf8");
    assert.match(source, /redirectGuestToAssistant/);
  });

  const memberVerify = fs.readFileSync(path.resolve(__dirname, "../pages/member-verify/member-verify.js"), "utf8");
  assert.doesNotMatch(memberVerify, /redirectGuestToAssistant/);
});

test("AI 页面仅 guest 可触发切换并在清理成功后进入身份选择", async () => {
  const context = loadPage("../pages/class-assistant/class-assistant.js", {
    success: true,
    cleared: true,
    alreadyMember: false,
  });
  context.page.onLoad();

  context.page.data.isGuest = false;
  context.page.switchIdentity();
  assert.deepEqual(context.calls, []);

  context.page.data.isGuest = true;
  context.page.switchIdentity();
  await flushPromises();

  assert.deepEqual(context.calls, ["clearGuestAccess"]);
  assert.deepEqual(context.routes, ["/pages/identity-select/identity-select"]);
});
