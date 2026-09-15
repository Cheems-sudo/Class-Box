// 测试说明：验证 retrieval-utils.test 模块的关键行为与边界条件。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  expandContinuationChunks,
  minScore,
  rankChunks,
  relativeScoreRatio,
  scoreChunk,
  tokenize,
  getCoveredConcepts,
  getQuestionPhrases,
  isUnderspecifiedQuestion,
} = require("../retrieval-utils");

test("中文问题会移除低信息问句词并生成概念词和二元词", () => {
  const tokens = tokenize("学生请假流程");
  assert.equal(tokens.includes("学生"), false);
  assert.equal(tokens.includes("请假"), true);
  assert.equal(tokens.includes("流程"), true);
});

test("复合实体在 stop words 处理前受到保护", () => {
  assert.ok(tokenize("学生会工作人员怎么产生？").includes("学生会工作人员"));
});

test("无明确对象的指代短问不召回制度", () => {
  assert.equal(isUnderspecifiedQuestion("这个怎么算？"), true);
  assert.deepEqual(rankChunks([{ title: "考试规定", content: "这个成绩这样计算。" }], "这个怎么算？", 5), []);
  assert.equal(isUnderspecifiedQuestion("综测怎么算？"), false);
});

test("concept coverage 需要完整短语或多数关键二元词", () => {
  const concepts = getQuestionPhrases("宿舍使用大功率电器");
  const weak = getCoveredConcepts({ content: "宿舍管理人员负责检查。" }, concepts);
  const strong = getCoveredConcepts({ content: "宿舍内不得使用大功率电器。" }, concepts);
  assert.deepEqual(weak, []);
  assert.deepEqual(strong, concepts);
});

test("未说明身份默认本科方向且不混入研究生专项制度", () => {
  const chunks = [
    { _id: "undergrad", title: "佛山大学本科学生国家奖助学金实施办法", content: "国家奖学金申请条件。", keywords: ["国家奖学金"] },
    { _id: "graduate", title: "佛山大学研究生国家奖助学金实施办法", content: "研究生国家奖学金申请条件。", keywords: ["国家奖学金"] },
  ];
  assert.deepEqual(rankChunks(chunks, "国家奖学金申请条件是什么？", 5).map((chunk) => chunk._id), ["undergrad"]);
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

test("候选上限不会截断已命中的跨切片条款", () => {
  const chunks = [
    { _id: "hit", sort: 100, title: "请假办法", content: "请假手续包括：" },
    { _id: "continued", sort: 200, title: "请假办法", content: "提交申请并获得批准。" },
    { _id: "other", sort: 300, title: "其他办法", content: "其他内容。" },
  ];
  assert.deepEqual(
    expandContinuationChunks(chunks, [chunks[0], chunks[2]], 1).map((item) => item._id),
    ["hit", "continued"],
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

test("未完标点后若下一 chunk 明确开始新条款则不串接", () => {
  const chunks = [
    { _id: "old", sort: 100, title: "处分规定", article: "第二十三条", content: "第二十三条 前款所列行为：" },
    { _id: "new", sort: 101, title: "处分规定", article: "第二十四条", content: "第二十四条 有下列行为之一的，给予处分。" },
  ];
  assert.deepEqual(expandContinuationChunks(chunks, [chunks[0]], 5).map((item) => item._id), ["old"]);
});

test("解析出的 article 引用不是新条款起始时仍可补全续文", () => {
  const chunks = [
    { _id: "start", sort: 100, title: "奖励办法", article: "第八条", content: "第八条 除本办法" },
    { _id: "continued", sort: 101, title: "奖励办法", article: "第七条", content: "第七条规定的情形外，均按有关办法执行奖励。" },
  ];
  assert.deepEqual(expandContinuationChunks(chunks, [chunks[0]], 5).map((item) => item._id), ["start", "continued"]);
});

test("学生条件型问题优先实质要求，但机构职责问题仍可命中组织条款", () => {
  const chunks = [
    { _id: "organization", sort: 1, title: "活动管理办法", article: "第三条", content: "学校成立活动管理机构和领导小组，负责制度制定、统筹规划和工作职责分工。" },
    { _id: "student", sort: 2, title: "活动管理办法", article: "第七条", content: "学生须在毕业前修满规定学分，并在第一学期结束前完成认定和备案。" },
  ];
  assert.equal(rankChunks(chunks, "学生参加活动需要满足什么要求？", 1)[0]._id, "student");
  assert.equal(rankChunks(chunks, "活动由哪个管理机构负责？", 1)[0]._id, "organization");
});

const retrievalCases = [
  {
    question: "评奖评优是否和体测成绩挂钩？",
    expected: "学籍管理",
    relevant: "学生评奖评优与体测成绩有关联的，按学校评奖评优相关管理文件执行。",
    distractor: "学生住宿表现与评奖评优挂钩。",
  },
  { question: "学生请假需要什么手续？", expected: "考勤与请假", relevant: "请假手续须由本人提出申请并获得批准。", distractor: "学生应参加教学活动。" },
  { question: "国家奖学金申请条件是什么？", expected: "国家奖助学金", relevant: "国家奖学金申请条件包括学习成绩与综合表现。", distractor: "学校设置多种奖励。" },
  { question: "第二课堂成绩单有什么要求？", expected: "第二课堂成绩单", relevant: "第二课堂成绩单要求本科生修满规定学分。", distractor: "课堂教学应遵守纪律。" },
  { question: "学生竞赛分类评价及奖励办法是什么？", expected: "竞赛分类评价及奖励", relevant: "竞赛分类评价及奖励办法规定竞赛分类与奖励标准。", distractor: "学生奖励坚持公开原则。" },
  { question: "学生宿舍有哪些管理规定？", expected: "住宿管理", relevant: "学生宿舍住宿管理包括安全、卫生和作息要求。", distractor: "违反规定可给予处理。" },
  { question: "旷课会受到什么处理？", expected: "考勤与请假", relevant: "学生旷课达到规定学时将按考勤与请假办法处理。", distractor: "伤害事故应及时处理。" },
];

test("七类真实问法均优先保留对应制度并过滤弱相关制度", () => {
  retrievalCases.forEach(({ question, expected, relevant, distractor }, index) => {
    const chunks = [
      { _id: `relevant-${index}`, sort: 100, title: `佛山大学学生${expected}管理办法`, keywords: [expected], content: relevant },
      { _id: `distractor-${index}`, sort: 200, title: "其他学生管理规定", keywords: ["学生", "管理", "规定"], content: distractor },
      { _id: `generic-${index}`, sort: 300, title: "通用规定", content: "学生成绩及相关情况按学校规定管理。" },
    ];
    const result = rankChunks(chunks, question, 5);
    assert.ok(result.length > 0, question);
    assert.equal(result[0]._id, `relevant-${index}`, question);
    assert.equal(result.some((chunk) => chunk._id === `generic-${index}`), false, question);
  });
});

test("绝对阈值和相对最高分阈值会过滤弱候选", () => {
  const question = "请假手续";
  const tokens = tokenize(question);
  const chunks = [
    { _id: "best", sort: 1, title: "请假手续", keywords: ["请假手续"], content: "请假手续说明。" },
    { _id: "weak", sort: 2, content: "请假后办理手续。" },
    { _id: "noise", sort: 3, content: "手续。" },
  ];
  const bestScore = scoreChunk(chunks[0], tokens, question);
  const weakScore = scoreChunk(chunks[1], tokens, question);
  assert.ok(bestScore >= minScore);
  assert.ok(weakScore < bestScore * relativeScoreRatio);
  assert.deepEqual(rankChunks(chunks, question, 5).map((chunk) => chunk._id), ["best"]);
});
