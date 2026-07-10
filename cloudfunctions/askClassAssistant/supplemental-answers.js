const gpaAnswer = `补充说明：以下绩点计算内容不属于《学生手册》，依据学校实际执行的绩点换算规则整理，具体结果以教务系统和教务部门解释为准。平均学分绩点（GPA）与学生手册中的“平均学分绩”不是同一指标。

绩点计算方式如下：

首先，将每门课程的百分制成绩转换为对应绩点。换算标准为：99—100分对应5.0；96—98分对应4.7；93—95分对应4.3；90—92分对应4.0；85—89分对应3.7；82—84分对应3.3；78—81分对应3.0；75—77分对应2.7；71—74分对应2.3；66—70分对应2.0；64—65分对应1.7；62—63分对应1.3；60—61分对应1.0。低于60分的课程不获得绩点。

完成换算后，用每门课程的学分乘以该课程绩点，得到该课程的绩点贡献值；将所有参与计算课程的绩点贡献值相加，再除以这些课程的总学分，即得到平均学分绩点（GPA）。因此，学分越高的课程，对最终GPA的影响越大。

绩点计算按照学校规定的课程范围执行，必修课、限选课等参与计算，公共选修课等不参与计算。平均学分绩点反映计入课程的综合学习表现，不是百分制成绩的简单平均值。`;

const expandQuestionAliases = (question) => String(question || "")
  .replace(/综测/g, "综合测评");

const getSupplementalAnswer = (question) => {
  const text = String(question || "").trim();

  if (/绩点/.test(text) || /\bGPA\b/i.test(text)) {
    return {
      key: "gpa_calculation",
      answer: gpaAnswer,
    };
  }

  return null;
};

module.exports = {
  expandQuestionAliases,
  getSupplementalAnswer,
};
