const test = require("node:test");
const assert = require("node:assert/strict");
const { __test } = require("../index");

const validDraft = {
  title: "高等数学考试", category: "考试安排", timeLabel: "考试时间", course: "高等数学",
  deadline: "2026-09-20 09:00", endTime: "2026-09-20 11:00", location: "A101",
  content: "请提前到场", isImportant: false, warnings: [],
};

test("纯 JSON 与 markdown code fence JSON 均可安全解析", () => {
  assert.deepEqual(__test.parseAiContent(JSON.stringify(validDraft)), validDraft);
  assert.deepEqual(__test.parseAiContent(`\`\`\`json\n${JSON.stringify(validDraft)}\n\`\`\``), validDraft);
});

test("非法 JSON、夹杂围栏和非对象结果被拒绝", () => {
  assert.equal(__test.parseAiContent("not-json"), null);
  assert.equal(__test.parseAiContent("text ```json {} ```"), null);
  assert.equal(__test.hasValidDraftSchema([]), false);
});

test("缺少必要字段或字段类型错误被拒绝", () => {
  const missing = { ...validDraft };
  delete missing.title;
  assert.equal(__test.hasValidDraftSchema(missing), false);
  assert.equal(__test.hasValidDraftSchema({ ...validDraft, isImportant: "false" }), false);
  assert.equal(__test.hasValidDraftSchema({ ...validDraft, warnings: [1] }), false);
});

test("正常响应字段结构保持不变，额外字段不会进入 draft", () => {
  assert.equal(__test.hasValidDraftSchema(validDraft), true);
  const draft = __test.sanitizeDraft({ ...validDraft, dangerous: "ignored" });
  assert.deepEqual(Object.keys(draft), [
    "title", "category", "timeLabel", "course", "deadline", "endTime", "location", "content", "isImportant", "warnings",
  ]);
  assert.deepEqual(draft, validDraft);
});
