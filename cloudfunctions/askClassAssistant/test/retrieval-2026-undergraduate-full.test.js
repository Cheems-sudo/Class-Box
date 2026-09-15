const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { rankChunks, expandContinuationChunks } = require("../retrieval-utils");
const { expandQuestionAliases } = require("../supplemental-answers");

const sourcePath = path.resolve(__dirname, "../../../data/handbook_chunks_2026_import.json");
const sourceExists = fs.existsSync(sourcePath);
const chunks = sourceExists
  ? fs.readFileSync(sourcePath, "utf8").trim().split(/\r?\n/).map(JSON.parse)
  : [];
const retrieve = (question) => {
  const expanded = expandQuestionAliases(question);
  return expandContinuationChunks(chunks, rankChunks(chunks, expanded, 5), 5);
};

const cases = [
  ["评奖评优是否和体测成绩挂钩？", /本科生学籍管理规定/],
  ["要不要体测？", /本科生学籍管理规定/],
  ["学生请假需要什么手续？", /考勤与请假管理办法/],
  ["旷课会受到什么处理？", /本科生学籍管理规定|考勤与请假管理办法|违纪处分规定/],
  ["考试作弊会怎样？", /违纪处分规定/],
  ["国家奖学金申请条件是什么？", /本科学生国家奖助学金实施办法/],
  ["家庭经济困难学生怎么申请资助？", /家庭经济困难学生认定办法|学生资助工作实施办法/],
  ["助学贷款怎么办理？", /学生资助工作实施办法/],
  ["宿舍有哪些主要管理规定？", /学生住宿管理规定/],
  ["宿舍能不能使用大功率电器？", /学生住宿管理规定/],
  ["第二课堂成绩单有什么要求？", /第二课堂成绩单/],
  ["综测怎么算？", /学生综合测评实施方案/],
  ["学生奖励有哪些种类？", /学生奖励管理规定/],
  ["学生参加竞赛有哪些分类和奖励规定？", /学生竞赛分类评价及奖励办法/],
  ["比赛有钱吗？", /学生竞赛分类评价及奖励办法/],
  ["转专业需要满足什么条件？", /转专业实施管理办法/],
  ["本科生要修多少学分才能毕业？", /本科生学籍管理规定|学士学位授予工作细则/],
  ["学生会工作人员怎么产生？", /学生会章程/],
  ["学生社团怎么申请成立？", /学生社团建设管理指引/],
  ["这个怎么算？", null],
];

cases.forEach(([question, expected]) => {
  test(`全量2026本科回归：${question}`, { skip: !sourceExists }, () => {
    const result = retrieve(question);
    if (!expected) {
      assert.deepEqual(result, []);
      return;
    }
    assert.ok(result.length > 0);
    assert.match(result[0].title, expected);
    assert.equal(result.some((chunk) => /研究生/.test(chunk.title)), false);
  });
});
