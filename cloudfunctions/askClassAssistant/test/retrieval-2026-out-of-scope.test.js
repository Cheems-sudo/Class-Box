const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { expandContinuationChunks, rankChunks } = require("../retrieval-utils");
const { expandQuestionAliases } = require("../supplemental-answers");

const chunks = fs.readFileSync(
  path.resolve(__dirname, "../../../data/handbook_chunks_2026_import.json"),
  "utf8",
).trim().split(/\r?\n/).map(JSON.parse);

const retrieve = (question) => {
  const ranked = rankChunks(chunks, expandQuestionAliases(question), 5);
  return {
    ranked,
    matched: expandContinuationChunks(chunks, ranked, 5),
  };
};

[
  "学校食堂今天有什么菜？",
  "今天食堂吃什么？",
  "明天天气怎么样？",
  "校门口奶茶店几点关门？",
  "学校附近哪家火锅好吃？",
  "今天有什么电影上映？",
].forEach((question) => {
  test(`完整2026数据对明显越界问题不使用原则条款兜底：${question}`, () => {
    const result = retrieve(question);
    assert.deepEqual(result.ranked, []);
    assert.equal(result.matched.length, 0);
  });
});

test("检索空结果在 DeepSeek 前直接形成 retrieval_no_match", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");
  const noMatchBranch = source.indexOf("if (!matchedChunks.length)");
  const noMatchOutcome = source.indexOf('outcome: "retrieval_no_match"', noMatchBranch);
  const noMatchAnswer = source.indexOf("answer: noMatchAnswer", noMatchBranch);
  const aiCall = source.indexOf('aiResult = await runStage("aiMs"', noMatchBranch);
  assert.ok(noMatchBranch >= 0);
  assert.ok(noMatchOutcome > noMatchBranch && noMatchOutcome < aiCall);
  assert.ok(noMatchAnswer > noMatchBranch && noMatchAnswer < aiCall);
  assert.match(source, /const noMatchAnswer = "学生手册中未找到明确规定。"/);
});
