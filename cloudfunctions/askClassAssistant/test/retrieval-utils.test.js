const test = require("node:test");
const assert = require("node:assert/strict");
const { expandContinuationChunks, rankChunks, tokenize } = require("../retrieval-utils");

test("中文问题会生成连续词和二元词", () => {
  const tokens = tokenize("学生请假流程");
  assert.equal(tokens.includes("学生请假流程"), true);
  assert.equal(tokens.includes("请假"), true);
  assert.equal(tokens.includes("流程"), true);
});

test("标题和关键词命中优先于仅正文命中", () => {
  const chunks = [
    { _id: "content", sort: 100, content: "学生请假需要提交材料" },
    { _id: "title", sort: 200, title: "请假流程", keywords: ["学生请假"], content: "按规定办理" },
  ];

  assert.equal(rankChunks(chunks, "学生请假", 2)[0]._id, "title");
});

test("同分切片按 sort 和 id 确定性排序", () => {
  const chunks = [
    { _id: "b", sort: 200, title: "请假" },
    { _id: "c", sort: 100, title: "请假" },
    { _id: "a", sort: 100, title: "请假" },
  ];

  assert.deepEqual(rankChunks(chunks, "请假", 3).map((item) => item._id), ["a", "c", "b"]);
});

test("命中未结束的跨页条款时自动补入下一切片", () => {
  const chunks = [
    { _id: "before", sort: 13100, title: "学籍规定", content: "上一条。" },
    { _id: "hit", sort: 13202, title: "学籍规定", content: "第三十八条 经学院批准，" },
    { _id: "continued", sort: 13300, title: "学籍规定", content: "报教务部备案，可申请免听。" },
    { _id: "other", sort: 13400, title: "其他规定", content: "无关内容。" },
  ];

  assert.deepEqual(
    expandContinuationChunks(chunks, [chunks[1]], 3).map((item) => item._id),
    ["hit", "continued"],
  );
});

test("连续跨越多个切片时一直补齐到完整句", () => {
  const chunks = [
    { _id: "first", sort: 100, title: "规定", content: "第一部分，" },
    { _id: "second", sort: 200, title: "规定", content: "第二部分：" },
    { _id: "third", sort: 300, title: "规定", content: "最终内容。" },
  ];

  assert.deepEqual(
    expandContinuationChunks(chunks, [chunks[0]], 5).map((item) => item._id),
    ["first", "second", "third"],
  );
});

test("章节标题和页脚不被误判为跨页续文", () => {
  const chunks = [
    { _id: "chapter", sort: 100, title: "规定", content: "本条内容完整。\n第五章 课程管理" },
    { _id: "footer", sort: 200, title: "规定", content: "本条内容完整。\n—6—" },
    { _id: "next", sort: 300, title: "规定", content: "下一条。" },
  ];

  assert.deepEqual(expandContinuationChunks(chunks, [chunks[0]], 5).map((item) => item._id), ["chapter"]);
  assert.deepEqual(expandContinuationChunks(chunks, [chunks[1]], 5).map((item) => item._id), ["footer"]);
});
