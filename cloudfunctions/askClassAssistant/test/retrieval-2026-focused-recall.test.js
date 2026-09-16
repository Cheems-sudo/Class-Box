const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const audit = require("./fixtures/handbook-2026-focused-recall.json");
const { expandContinuationChunks, rankChunks } = require("../retrieval-utils");
const { expandQuestionAliases } = require("../supplemental-answers");

const chunks = fs.readFileSync(
  path.resolve(__dirname, "../../../data/handbook_chunks_2026_import.json"),
  "utf8",
).trim().split(/\r?\n/).map(JSON.parse);

const retrieve = (question) => expandContinuationChunks(
  chunks,
  rankChunks(chunks, expandQuestionAliases(question), 5),
  5,
);

const retrieveWithDiagnostics = (question) => {
  const primary = rankChunks(chunks, expandQuestionAliases(question), 5);
  const context = expandContinuationChunks(chunks, primary, 5);
  return { primary, context, diagnostics: primary.retrievalDiagnostics };
};

const evaluate = (item) => {
  const matched = retrieve(item.question);
  const matchedSorts = matched.map((chunk) => chunk.sort);
  if (item.handbookStatus === "HANDBOOK_NOT_EXPLICIT") {
    return { status: "PASS", matched, matchedSorts };
  }
  const requiredGroups = item.requiredAnyOf || [item.requiredSorts];
  if (requiredGroups.some((group) => group.every((sort) => matchedSorts.includes(sort)))) {
    return { status: "PASS", matched, matchedSorts };
  }
  const partial = item.requiredSorts.some((sort) => matchedSorts.includes(sort));
  if (partial) return { status: "PARTIAL", matched, matchedSorts };
  const expectedTitles = new Set(chunks
    .filter((chunk) => item.requiredSorts.includes(chunk.sort))
    .map((chunk) => chunk.title));
  return {
    status: matched.some((chunk) => expectedTitles.has(chunk.title)) ? "MISS" : "WRONG",
    matched,
    matchedSorts,
  };
};

test("76题重点漏召回审计达到明确证据验收门槛", () => {
  assert.equal(chunks.length, audit.source.sourceChunkCount);
  assert.equal(audit.cases.length, 76);
  const results = audit.cases.map((item) => ({ item, ...evaluate(item) }));
  const explicit = results.filter(({ item }) => item.handbookStatus === "EXPLICIT");
  const counts = results.reduce((summary, result) => {
    summary[result.status] += 1;
    return summary;
  }, { PASS: 0, PARTIAL: 0, MISS: 0, WRONG: 0 });
  const explicitPass = explicit.filter((result) => result.status === "PASS").length;
  const explicitMissOrWrong = explicit.filter((result) => ["MISS", "WRONG"].includes(result.status)).length;

  assert.ok(explicitPass >= 65, `明确答案 PASS=${explicitPass}, counts=${JSON.stringify(counts)}`);
  assert.equal(explicitMissOrWrong, 0, `明确答案 MISS+WRONG=${explicitMissOrWrong}`);
});

test("precision 诊断保持召回门槛并压缩无边际增益 primary", () => {
  const samples = audit.cases.map((item) => retrieveWithDiagnostics(item.question));
  const finalPrimary = samples.map(({ context }) => context.filter((chunk) => !chunk.retrievalMeta.continuation));
  const primaryCounts = finalPrimary.map((primary) => primary.length).sort((a, b) => a - b);
  const policyCounts = finalPrimary.map((primary) => new Set(primary.map((chunk) => chunk.title)).size);
  const averagePrimary = primaryCounts.reduce((sum, count) => sum + count, 0) / primaryCounts.length;
  const averagePolicies = policyCounts.reduce((sum, count) => sum + count, 0) / policyCounts.length;
  const multiPolicyCount = policyCounts.filter((count) => count > 1).length;
  const continuationCount = samples.reduce((sum, { context }) => sum
    + context.filter((chunk) => chunk.retrievalMeta.continuation).length, 0);
  const redundantChunkCount = samples.reduce((sum, { diagnostics }) => sum
    + diagnostics.redundantChunkCount, 0);

  assert.ok(averagePrimary <= 4.2, `averagePrimary=${averagePrimary}`);
  assert.ok(multiPolicyCount < 44, `multiPolicyCount=${multiPolicyCount}`);
  assert.ok(redundantChunkCount > 0);
  assert.ok(continuationCount > 0);
  assert.ok(averagePolicies > 0);
  assert.equal(primaryCounts[Math.ceil(primaryCounts.length * 0.5) - 1] <= 4, true);
  assert.equal(primaryCounts[Math.ceil(primaryCounts.length * 0.9) - 1] <= 5, true);
  samples.forEach(({ primary, context, diagnostics }) => {
    assert.equal(primary.length, diagnostics.primaryCount);
    assert.ok(context.filter((chunk) => !chunk.retrievalMeta.continuation).length <= Math.min(primary.length, 5));
    primary.forEach((chunk) => assert.ok(Array.isArray(chunk.retrievalMeta.marginalCoverageAdded)));
  });
});

test("奖学金体测口语、自然问法和正式问法均召回第二十九条", () => {
  [
    "要拿奖学金的话体测至少要多少分？",
    "体测69分还能拿奖学金吗？",
    "评奖评优体测最低几分？",
  ].forEach((question) => {
    assert.ok(retrieve(question).some((chunk) => chunk.sort === 195005), question);
  });
});

test("20个重点真实问题均召回所需具体证据", () => {
  const cases = [
    ["要拿奖学金的话体测至少要多少分？", [195005]],
    ["体测69分还能拿奖学金吗？", [195005]],
    ["评奖评优体测最低几分？", [195005]],
    ["国家奖学金多少钱？", [198004]],
    ["国家励志奖学金多少钱？", [198004]],
    ["学校助学金多少钱？", [217001]],
    ["勤工助学一小时多少钱？", [239000]],
    ["第二课堂一共多少学分？", [381002]],
    ["每个模块最低多少学分？", [382001]],
    ["图书馆最多借多少本？", [363000]],
    ["图书馆能借多久？", [363000]],
    ["缓考需要什么条件？", [165002]],
    ["缓考怎么办理？", [165002]],
    ["网络账号借给别人会有什么处分？", [273000]],
    ["家庭经济困难怎么分等级？", [247001]],
    ["比赛分几类？", [423001]],
    ["比赛有什么奖励？", [425002]],
    ["比赛分几类，各有什么奖励？", [423001, 425002]],
    ["本科毕业需要满足什么条件？", [144001]],
    ["学士学位需要满足什么条件？", [156005]],
  ];
  cases.forEach(([question, required]) => {
    const matchedSorts = retrieve(question).map((chunk) => chunk.sort);
    required.forEach((sort) => assert.ok(matchedSorts.includes(sort), `${question}: missing ${sort}`));
  });
});
