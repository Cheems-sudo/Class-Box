const test = require("node:test");
const assert = require("node:assert/strict");
const { parseModelAnswer } = require("../citation-utils");
const { expandContinuationChunks } = require("../retrieval-utils");

test("缺失或非法引用编号不会默认引用片段1", () => {
  const chunks = [{ _id: "one", sort: 1, title: "规定", content: "正文。" }];
  assert.equal(parseModelAnswer("回答", chunks, expandContinuationChunks).citationValid, false);
  assert.deepEqual(parseModelAnswer("回答\n引用片段：9", chunks, expandContinuationChunks).citedChunks, []);
});

test("引用续文复用安全 continuation 边界", () => {
  const chunks = [
    { _id: "a", sort: 1, title: "处分规定", article: "第二十三条", content: "第二十三条 包括：" },
    { _id: "b", sort: 2, title: "处分规定", article: "第二十四条", content: "第二十四条 其他行为。" },
  ];
  const parsed = parseModelAnswer("会受到处分。\n引用片段：1", chunks, expandContinuationChunks);
  assert.equal(parsed.citationValid, true);
  assert.deepEqual(parsed.citedChunks.map((chunk) => chunk._id), ["a"]);
});

test("引用真正跨页续文时补入后半段", () => {
  const chunks = [
    { _id: "a", sort: 1, title: "请假办法", content: "办理请假应当：" },
    { _id: "b", sort: 2, title: "请假办法", content: "提交申请并经批准。" },
  ];
  const parsed = parseModelAnswer("应提交申请。\n引用片段：1", chunks, expandContinuationChunks);
  assert.deepEqual(parsed.citedChunks.map((chunk) => chunk._id), ["a", "b"]);
});
