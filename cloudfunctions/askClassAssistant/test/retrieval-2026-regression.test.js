// Regression snapshot copied verbatim from the production-shaped 2026 import.
const test = require("node:test");
const assert = require("node:assert/strict");
const snapshot = require("./fixtures/handbook-2026-regression.json");
const {
  expandContinuationChunks,
  rankChunks,
} = require("../retrieval-utils");

const retrieve = (question) => {
  const ranked = rankChunks(snapshot.chunks, question, 5);
  return expandContinuationChunks(snapshot.chunks, ranked, 5);
};

test("2026 回归快照具有真实来源标识和完整 chunk 字段", () => {
  assert.equal(snapshot.source.handbookVersion, "2026");
  assert.equal(snapshot.source.sourceChunkCount, 1724);
  assert.match(snapshot.source.sha256, /^[A-F0-9]{64}$/);
  snapshot.chunks.forEach((chunk) => {
    ["handbookVersion", "title", "section", "article", "pageText", "keywords", "content", "sort"]
      .forEach((field) => assert.ok(Object.hasOwn(chunk, field), `${chunk.sort}: ${field}`));
    assert.equal(chunk.handbookVersion, "2026");
  });
});

const cases = [
  {
    question: "评奖评优是否和体测成绩挂钩？",
    verify(chunks) {
      assert.deepEqual(chunks.map((chunk) => chunk.sort), [129003]);
      assert.equal(chunks[0].article, "第二十五条");
    },
  },
  {
    question: "学生请假需要什么手续？",
    verify(chunks) { assert.ok(chunks.every((chunk) => chunk.title === "佛山大学学生考勤与请假管理办法")); },
  },
  {
    question: "旷课会受到什么处理？",
    verify(chunks) { assert.ok(chunks.some((chunk) => chunk.content.includes("旷课"))); },
  },
  {
    question: "国家奖学金申请条件是什么？",
    verify(chunks) { assert.ok(chunks.some((chunk) => chunk.title.includes("本科学生国家奖助学金"))); },
  },
  {
    question: "家庭经济困难学生怎么申请资助？",
    verify(chunks) {
      const titles = new Set(chunks.map((chunk) => chunk.title));
      assert.ok(titles.has("佛山大学家庭经济困难学生认定办法"));
      assert.ok(titles.has("佛山大学学生资助工作实施办法"));
    },
  },
  {
    question: "宿舍有哪些主要管理规定？",
    verify(chunks) { assert.ok(chunks.every((chunk) => chunk.title === "佛山大学学生住宿管理规定")); },
  },
  {
    question: "第二课堂成绩单有什么要求？",
    verify(chunks) { assert.ok(chunks.every((chunk) => chunk.title.includes("第二课堂成绩单"))); },
  },
  {
    question: "学生参加竞赛有哪些分类和奖励规定？",
    verify(chunks) {
      assert.ok(chunks.every((chunk) => chunk.title === "佛山大学学生竞赛分类评价及奖励办法"));
      assert.ok(chunks.some((chunk) => chunk.article === "第五条"));
      assert.ok(chunks.some((chunk) => ["第八条", "第九条", "第十条"].includes(chunk.article)));
      assert.equal(chunks.some((chunk) => chunk.article === "第二十三条"), false);
    },
  },
  {
    question: "转专业需要满足什么条件？",
    verify(chunks) { assert.ok(chunks.every((chunk) => chunk.title.includes("转专业实施管理办法"))); },
  },
  {
    question: "考试作弊会受到什么处分？",
    verify(chunks) {
      assert.ok(chunks.some((chunk) => chunk.article === "第二十三条"));
      assert.equal(chunks.some((chunk) => chunk.article === "第三十四条"), false);
    },
  },
];

cases.forEach(({ question, verify }) => {
  test(`2026 真实快照：${question}`, () => {
    const chunks = retrieve(question);
    assert.ok(chunks.length > 0);
    verify(chunks);
  });
});

test("结构标题结尾不会把下一条款作为 continuation 串入", () => {
  const heading = snapshot.chunks.find((chunk) => chunk.sort === 273000);
  const expanded = expandContinuationChunks(snapshot.chunks, [heading], 5);
  assert.deepEqual(expanded.map((chunk) => chunk.sort), [273000]);
});
