// 测试说明：验证 supplemental-answers.test 模块的关键行为与边界条件。
const test = require("node:test");
const assert = require("node:assert/strict");
const { expandQuestionAliases, getSupplementalAnswer } = require("../supplemental-answers");

test("综测会展开为学生手册使用的正式名称", () => {
  assert.equal(expandQuestionAliases("综测怎么算"), "综合测评怎么算");
});

test("本科常见口语会归一化为手册正式用语", () => {
  assert.equal(expandQuestionAliases("要不要体测"), "要不要体质健康测试");
  assert.equal(expandQuestionAliases("宿舍能用电器吗"), "住宿能用电器吗");
  assert.equal(expandQuestionAliases("比赛有钱吗"), "竞赛有哪些奖励");
  assert.equal(expandQuestionAliases("助学贷款怎么办"), "学生资助 助学贷款怎么办");
});

test("绩点和 GPA 返回非手册补充说明", () => {
  const byChinese = getSupplementalAnswer("绩点怎么算");
  const byEnglish = getSupplementalAnswer("GPA");

  assert.equal(byChinese.key, "gpa_calculation");
  assert.equal(byEnglish.key, "gpa_calculation");
  assert.match(byChinese.answer, /不属于《学生手册》/);
  assert.match(byChinese.answer, /99—100分对应5\.0/);
  assert.match(byChinese.answer, /公共选修课等不参与计算/);
});

test("平均学分绩不会被误判为绩点问题", () => {
  assert.equal(getSupplementalAnswer("平均学分绩"), null);
});
