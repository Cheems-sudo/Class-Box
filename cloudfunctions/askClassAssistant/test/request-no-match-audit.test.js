const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { finishRequestDocument } = require("../request-state-utils");

const source = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");

const completeNoMatchFlow = async (outcome, matchedChunks) => {
  const stored = {
    _id: "ask_real_flow_1",
    cancelled: false,
    status: "running",
    createdAt: new Date("2026-09-16T08:00:00.000Z"),
  };
  const requestDoc = {
    async update({ data }) {
      Object.assign(stored, data);
    },
  };
  await finishRequestDocument(requestDoc, "answered", {
    outcome,
    question: "学校食堂今天有什么菜？",
    answer: "学生手册中未找到明确规定。",
    handbookVersion: "2026",
    matchedChunks,
  }, "rag-keyword-v5", new Date("2026-09-16T08:00:02.000Z"));
  return stored;
};

test("retrieval_no_match 最终文档同时保留 answered 状态和审计字段", async () => {
  const stored = await completeNoMatchFlow("retrieval_no_match", []);
  assert.equal(stored.status, "answered");
  assert.equal(stored.outcome, "retrieval_no_match");
  assert.equal(stored.question, "学校食堂今天有什么菜？");
  assert.equal(stored.answer, "学生手册中未找到明确规定。");
  assert.equal(stored.retrievalVersion, "rag-keyword-v5");
  assert.equal(stored.handbookVersion, "2026");
  assert.deepEqual(stored.matchedChunks, []);
  assert.ok(stored.createdAt);
  assert.ok(stored.completedAt);
});

test("model_no_match 最终文档保留实际候选摘要", async () => {
  const matchedChunks = [{
    title: "佛山大学学生奖励管理规定",
    page: 195,
    article: "第二十九条",
    score: 120,
    coveredConcepts: ["奖励"],
    continuation: false,
  }];
  const stored = await completeNoMatchFlow("model_no_match", matchedChunks);
  assert.equal(stored.status, "answered");
  assert.equal(stored.outcome, "model_no_match");
  assert.deepEqual(stored.matchedChunks, matchedChunks);
});

test("真实分支由 finally 对同一 requestId 单次完成持久化", () => {
  assert.match(source, /requestStatus = "answered";\s*requestCompletion = \{\s*outcome: "retrieval_no_match"/);
  assert.match(source, /requestStatus = "answered";\s*requestCompletion = \{\s*outcome: "model_no_match"/);
  assert.match(source, /finally[\s\S]*finishRequest\(requestId, requestStatus, requestCompletion\)/);
  assert.doesNotMatch(source, /recordNoMatchRequest/);
});
