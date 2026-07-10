const test = require("node:test");
const assert = require("node:assert/strict");

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const loadPage = (calls) => {
  let definition;
  global.Page = (value) => {
    definition = value;
  };
  global.wx = {
    cloud: {
      callFunction(options) {
        const call = deferred();
        calls.push({ options, ...call });
        return call.promise;
      },
    },
    showToast() {},
    navigateTo() {},
  };

  const modulePath = require.resolve("../../../miniprogram/pages/class-assistant/class-assistant.js");
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
  page.onLoad();
  page.data.verified = true;
  return page;
};

test("停止后立即提问时，旧请求返回不会结束新请求", async () => {
  const calls = [];
  const page = loadPage(calls);

  page.data.question = "第一个问题";
  page.sendQuestion();
  const oldRequestId = page.activeRequestId;
  page.stopAnswer();

  page.data.question = "第二个问题";
  page.sendQuestion();
  const newRequestId = page.activeRequestId;

  assert.notEqual(newRequestId, oldRequestId);
  assert.equal(page.data.sending, true);
  calls[0].resolve({ result: { success: true, answer: "旧回答" } });
  await Promise.resolve();

  assert.equal(page.activeRequestId, newRequestId);
  assert.equal(page.data.sending, true);

  calls[1].resolve({ result: { success: true, cancelled: true } });
  calls[2].resolve({ result: { success: false, message: "测试结束" } });
  await Promise.resolve();
  page.onUnload();
});

test("依据默认收起、可以展开且保留换行", () => {
  const page = loadPage([]);
  const answer = page.splitAnswerText("回答正文\n依据：\n1. 第一条。\n2. 第二条。");
  const message = page.createMessage("assistant", answer.content, { citation: answer.citation });
  page.data.messages = [message];

  assert.equal(message.citationExpanded, false);
  assert.equal(answer.citation, "依据：\n1. 第一条。\n2. 第二条。");

  page.toggleCitation({ currentTarget: { dataset: { id: message.id } } });
  assert.equal(page.data.messages[0].citationExpanded, true);
  page.onUnload();
});
