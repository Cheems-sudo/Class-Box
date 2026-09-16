# 2026 学生手册 RAG 具体答案漏召回修复报告

## A. 根因最终归纳

1. tokenizer 丢失“数字+单位”的完整表达，导致 `70分`、`7学分`、`15个工作日` 等不能形成强证据。
2. 排序只看词面相关度，未区分“按有关规定执行”的原则条款与包含数值、期限、处分、例外的执行条款。
3. 制度级筛选过早，相关答案位于另一制度、附件、表格或跨页续文时无法进入最终候选。
4. 多意图问题按总分取前若干条，重复覆盖一个概念，未主动补足另一个概念。

## B. 修改文件

- `cloudfunctions/askClassAssistant/retrieval-utils.js`
- `cloudfunctions/askClassAssistant/supplemental-answers.js`
- `cloudfunctions/askClassAssistant/test/retrieval-utils.test.js`
- `cloudfunctions/askClassAssistant/test/supplemental-answers.test.js`
- `cloudfunctions/askClassAssistant/test/retrieval-2026-regression.test.js`
- `cloudfunctions/askClassAssistant/test/retrieval-2026-undergraduate-full.test.js`
- `cloudfunctions/askClassAssistant/test/retrieval-2026-focused-recall.test.js`
- `cloudfunctions/askClassAssistant/test/fixtures/handbook-2026-focused-recall.json`

未修改学生手册数据、Prompt、DeepSeek、citation、前端和 `index.js`。

## C–H. 检索机制

- tokenizer 同时保留完整量化 token、数值和单位，覆盖整数、小数、百分比、中文数词、工作日、学期、册、次、小时等。
- 独立识别量化、期限、处罚、例外和条件意图；“奖学金有什么要求”不会仅因“要求”被当成纯金额问题。
- 对原则、背景、组织机构、附则等结构降权；只有语义相关时，才提升包含匹配单位、期限、处罚、条件或例外的条款。
- 多意图采用 covered-concept 增益选取，并在最终返回前检查证据类型缺口。
- 附件、短表格和跨页枚举不再因正文短而自然落选；跨页补齐仍受同制度、新条款边界和 hard cap 约束。
- primary hard cap 保持 5；没有通过无限扩大 Top-K 换召回率。证据补全只在有语义覆盖且达到绝对/相对分数门槛时发生。

## I. 76 题前后对比

| 阶段 | PASS | PARTIAL | MISS | WRONG |
|---|---:|---:|---:|---:|
| 修复前 | 39 | 6 | 16 | 15 |
| 修复后 | 70 | 6 | 0 | 0 |

其中 4 题为 `HANDBOOK_NOT_EXPLICIT`；72 道明确答案题中 PASS 为 66，达到 `PASS >= 65`，且 `MISS + WRONG = 0`。

仍为 PARTIAL 的 6 题：家庭经济困难认定两种问法、转专业条件两种问法、竞赛分类和奖金组合问法、社团成立材料与审批流程。它们均已召回部分正确条款，但没有在单次上下文内覆盖 gold 的全部切片。

Gold 校正共 3 处，均保留说明：第 36 题两套本科缓考条款均可构成完整答案；第 37 题处分应以《学生违纪处分规定》第二十七条续页为准；第 73 题首次申诉期限为第十条的 10 日，而非委员会答复的 15 日。

## J. 20 个重点问题

20/20 均进入所需具体证据。关键 sort：奖学金体测 `195005`；国家奖学金/励志奖学金金额 `198004`；学校助学金 `217001`；勤工助学 `239000`；第二课堂总分与模块 `381002/382001`；图书馆数量与期限 `363000`；缓考 `165002`；账号外借处分 `273000`；困难等级 `247001`；竞赛分类/奖励 `423001/425002`；本科毕业 `144001`；学士学位 `156005`。

## K–L. 原有回归与全部测试

- 原有核心回归：36/36 通过。
- `npm test`：108/108 通过，0 失败。
- 新增专项：76 题门槛、3 种奖学金体测问法、20 个重点问题全部通过。

## M. Precision 监控

| 指标 | 修复前 | 修复后 |
|---|---:|---:|
| 平均 primary matched chunks | 3.22 | 4.97 |
| 最大 matched chunks（含续文） | 12 | 14 |
| continuation 总数 | 93 | 168 |
| 多制度结果题数 | 18 | 44 |

primary 上限仍为 5，但平均值和跨制度结果明显增加。这是本轮以召回完整性换来的真实成本，不能描述成“precision 无损”。旧审计的 `irrelevantNoise` 是人工/规则混合标签，新结果没有同口径复标，因此不把“非 gold 制度”冒充成可直接比较的无关制度率。

## N–O. 新误召回与未解决项

- 没有出现专项 gold 的 MISS/WRONG；但部分量化问题仍会带入语义较弱的其他制度或同制度内的辅助条款。这是当前最明确的 precision 风险。
- 6 个 PARTIAL 仍需后续改善“同一主题多个并列切片”的覆盖，而不应继续扩大候选数。
- “要不要体测”本身语义不完整，当前可能优先返回奖励制度；若用户实际问的是是否必须参加年度体测，学籍第二十五条才是更直接答案。后续应做通用的问句对象/目的消歧，而非新增题目专用分支。

## P. 校验

- `npm test`：通过（108/108）。
- `git diff --check`：通过，无 whitespace error。
- 检索版本：`rag-keyword-v4`。

## 奖学金体测最低分结论

现在三种问法均稳定召回 sort `195005`，即《佛山大学学生奖励管理规定》第二十九条，并自动带入 sort `196000` 的跨页续文。结论是“正确具体条款已稳定进入模型上下文”，但上下文仍存在可继续压缩的弱相关候选，不能宣称检索精度问题已经彻底解决。
