// 云函数说明：封装 retrieval-utils 相关的服务端校验与数据处理流程。
const stopWords = new Set([
  "学生", "成绩", "管理", "规定", "相关", "情况", "是否", "什么", "哪些",
  "怎么", "如何", "需要", "要求", "可以", "进行", "办法", "学校", "大学",
  "管理规定", "受到",
]);
const lowInformationPhrases = new Set([...stopWords, "处理", "手续"]);
const minScore = 16;
const relativeScoreRatio = 0.8;
const documentScoreRatio = 0.55;
const conceptSupplementLimit = 2;
const retrievalVersion = "rag-keyword-v5";

const quantitativeIntentPattern = /多少|几分|几个|几天|几日|多久|多少钱|几次|几学分|至少|最低|最高|不低于|不少于|不超过|截止|上限|下限|比例|百分之|金额|标准|几本|几册|多长时间/;
const deadlineIntentPattern = /几天|几日|多久|什么时候|何时|最晚|截止|期限|多长时间|申请时间|公示/;
const sanctionIntentPattern = /处分|处罚|后果|会怎样|怎么办|怎么处理|警告|记过|开除|退学|扣分|影响评奖/;
const exceptionIntentPattern = /例外|特殊情况|残疾|伤病|生病|免修|免测|免考|缓考|延期|延长|能不能|可以不/;
const principlePattern = /按[^。；]{0,30}(?:相关管理文件|相关文件|有关规定|相关规定|有关办法)[^。；]{0,10}执行|按照[^。；]{0,30}(?:相关管理文件|相关文件|有关规定|相关规定|有关办法)[^。；]{0,10}执行|具体(?:申请条件|要求|办法|流程)?[^。；]{0,18}按[^。；]{0,24}执行|另行规定|参照[^。；]{0,24}(?:规定|办法)|具体办法另行制定|根据有关办法/;
const backgroundPattern = /^(?:第[^\s]{1,8}条\s*)?(?:为|本规定适用于|本办法适用于)|组织机构|领导小组|职责分工|负责解释|自[^。]{0,20}(?:施行|执行)|同时废止|制定本(?:规定|办法)/;
const answerSignalPattern = /申请条件|资格|奖励标准|资助标准|工资标准|学分|排名|不低于|不少于|不超过|以上|以下|以内|截止|期限|工作日|警告|严重警告|记过|留校察看|开除|退学|免修|免测|免考|缓考|审批|办理|申请程序|流程/;
const quantityPattern = /(?:\d+(?:\.\d+)?|[一二两三四五六七八九十百千万]+)(?:个工作日|工作日|学分|元(?:\/小时)?|分|天|日|个月|月|学期|小时|册|本|次|%|％|年)|百分之[一二两三四五六七八九十百千万\d]+|\d+(?:\.\d+)?\s*[-—～至]\s*\d+(?:\.\d+)?\s*(?:元|分|天|日|月|年|学分|小时|册|本|次|%|％)?/g;

const normalize = (text) => String(text || "").toLowerCase().replace(/\s+/g, "");

const getQuantitativeTokens = (text) => {
  const source = normalize(text).replace(/／/g, "/");
  const complete = source.match(quantityPattern) || [];
  const tokens = [];
  complete.forEach((token) => {
    tokens.push(token);
    const number = token.match(/\d+(?:\.\d+)?|[一二两三四五六七八九十百千万]+/);
    const unit = token.match(/个工作日|工作日|学分|元\/小时|元|分|天|日|个月|月|学期|小时|册|本|次|%|％/);
    if (number) tokens.push(number[0]);
    if (unit) tokens.push(unit[0]);
  });
  return Array.from(new Set(tokens));
};

const getRequestedQuantityUnits = (question) => {
  const source = normalize(question);
  const units = [];
  if (/多少钱|金额|工资|奖金|资助标准|奖励标准|多少元/.test(source)) units.push("元");
  if (/(?:奖学金|助学金|补助|资助)[^？。]{0,12}(?:多少|最低|最高|标准)/.test(source)) units.push("元");
  if (/几学分|多少学分|学分要求/.test(source)) units.push("学分");
  if (/几分|多少分|最低分|最高分|平均分/.test(source)) units.push("分");
  if (/几天|几日|工作日|公示|截止|最晚/.test(source)) units.push("日", "天", "工作日");
  if (/多久|多长时间|几个月|期限/.test(source)) units.push("天", "日", "月", "个月", "年", "学期");
  if (/几次|多少次/.test(source)) units.push("次");
  if (/几本|多少本|几册|多少册/.test(source)) units.push("本", "册");
  if (/几小时|多少小时|时薪|一小时/.test(source)) units.push("小时", "元/小时");
  if (/比例|百分之|百分比/.test(source)) units.push("%", "％");
  return Array.from(new Set(units));
};

const getConceptRuns = (text) => String(text || "").toLowerCase().replace(/\s+/g, "|")
  .replace(/[？?，,、。！!；;：:]/g, "|")
  .replace(/是否|有没有|能不能|要不要|是什么|有哪些|有什么|有何|会受到|哪些|什么|怎么|如何|需要|要求|相关情况/g, "|")
  .replace(/学生(?!会|干部|骨干|社团)/g, "|")
  .replace(/和|与|及/g, "|")
  .replace(/[吗呢]$/g, "|")
  .split("|")
  .map((part) => part.replace(/[吗呢]$/, "").replace(/(?:管理规定|规定|办法)$/, ""))
  .filter((part) => part.length >= 2 && !stopWords.has(part));

const ambiguousConcepts = new Set(["这个", "那个", "这项", "那项", "此项", "这样", "那样"]);
const getConceptVariants = (concept) => {
  if (concept === "奖励") return ["奖励", "获奖", "奖金"];
  if (/学生干部/.test(concept)) return [concept, concept.replace(/学生干部/g, "学生骨干")];
  if (/体质健康测试/.test(concept)) return [concept, concept.replace(/体质健康测试/g, "体能测试")];
  return [concept];
};

const isUnderspecifiedQuestion = (question) => {
  const concepts = getConceptRuns(question);
  return !concepts.length || concepts.every((concept) => ambiguousConcepts.has(concept));
};

const tokenize = (text) => {
  const runs = getConceptRuns(text).flatMap((part) => part.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{2,}/g) || []);
  const tokens = [];

  runs.forEach((run) => {
    if (!stopWords.has(run)) tokens.push(run);
    if (!/^[\u4e00-\u9fa5]+$/.test(run)) return;
    for (let index = 0; index < run.length - 1; index += 1) {
      const pair = run.slice(index, index + 2);
      if (!stopWords.has(pair)) tokens.push(pair);
    }
  });

  return Array.from(new Set([...getQuantitativeTokens(text), ...tokens]));
};

const getQuestionPhrases = (question) => getConceptRuns(question)
  .filter((phrase) => !lowInformationPhrases.has(phrase));

const getQuestionIntentProfile = (question) => {
  const source = normalize(question);
  const asksForStudentAction = /要求|条件|怎么办|怎么|如何|需要|手续|流程|资格|标准|期限|什么时候/.test(source);
  const asksForOrganization = /谁负责|哪个部门|什么部门|管理机构|组织机构|领导小组|工作组|职责分工/.test(source);
  return {
    asksForStudentAction,
    asksForOrganization,
    quantitativeIntent: quantitativeIntentPattern.test(source)
      || getQuantitativeTokens(source).length > 0
      || /(?:成绩|学分|金额|工资|借阅|体能测试|体质健康测试)[^？。]{0,10}(?:要求|标准)/.test(source),
    deadlineIntent: deadlineIntentPattern.test(source),
    sanctionIntent: sanctionIntentPattern.test(source),
    exceptionIntent: exceptionIntentPattern.test(source),
    conditionIntent: /条件|要求|资格|门槛|怎么分等级|如何分等级|产生|选拔|怎么办理|怎么申请/.test(source),
  };
};

const getChunkStructureProfile = (chunk) => {
  const content = normalize(chunk && chunk.content);
  const article = normalize(chunk && chunk.article);
  const section = normalize(chunk && chunk.section);
  const quantities = getQuantitativeTokens(content);
  return {
    isPrinciple: principlePattern.test(content),
    isBackground: (backgroundPattern.test(content)
      && !/认定程序|申请程序|办理流程/.test(content))
      || (!article && /总则|附则|组织机构|职责/.test(section)),
    isAttachment: /附件|附表|申请表|工资表|标准表/.test(`${section}${content.slice(0, 80)}`),
    hasQuantity: quantities.length > 0,
    quantities,
    hasDeadline: /工作日|期限|截止|之前|以内|届满|开学|学期|考前|开始前|\d+天|\d+日|\d+个月|[一二三四五六七八九十]+天/.test(content),
    hasSanction: /警告|严重警告|记过|留校察看|开除|退学|处分|取消资格|扣\d|扣分/.test(content),
    hasException: /除外|特殊情况|残疾|伤病|因病|免修|免测|免考|缓考|延期|延长/.test(content),
    hasCondition: /申请条件|任职条件|认定为.{0,8}困难|须同时|应同时|有下列情形|修完.{0,30}学分|准予毕业|选拔过程|选举产生|申请程序|缴费程序/.test(content),
    hasAnswerSignal: answerSignalPattern.test(content),
  };
};

const getMarginalInformationKeys = (candidate, intent, requestedUnits) => {
  const keys = new Set((candidate.coveredConcepts || []).map((concept) => `concept:${concept}`));
  (candidate.titleCoveredConcepts || []).forEach((concept) => keys.add(`scope:${concept}`));
  const profile = candidate.structure || getChunkStructureProfile(candidate.chunk || candidate);
  const content = normalize((candidate.chunk || candidate).content);
  if (intent.quantitativeIntent) {
    profile.quantities
      .filter((quantity) => !requestedUnits.length || requestedUnits.some((unit) => quantity.includes(unit)))
      .forEach((quantity) => keys.add(`quantity:${quantity}`));
  }
  if (intent.deadlineIntent && profile.hasDeadline) keys.add("evidence:deadline");
  if (intent.sanctionIntent && profile.hasSanction) {
    keys.add("evidence:sanction");
    (content.match(/严重警告|警告|记过|留校察看|开除|退学|取消资格|扣分/g) || [])
      .forEach((value) => keys.add(`sanction:${value}`));
  }
  if (intent.exceptionIntent && profile.hasException) {
    keys.add("evidence:exception");
    (content.match(/残疾|伤病|因病|免修|免测|免考|缓考|延期|延长/g) || [])
      .forEach((value) => keys.add(`exception:${value}`));
  }
  if (intent.conditionIntent && profile.hasCondition) keys.add("evidence:condition");
  if (intent.asksForStudentAction) {
    if (/申请|提交|填写|报名/.test(content)) keys.add("flow:apply");
    if (/材料|证明|申请表|审批表/.test(content)) keys.add("flow:materials");
    if (/审核|审查|批准|审批/.test(content)) keys.add("flow:approve");
    if (/公示/.test(content)) keys.add("flow:publish");
    if (/备案|存入.{0,8}档案|归档/.test(content)) keys.add("flow:record");
    if (/申诉|复核/.test(content)) keys.add("flow:review");
  }
  return keys;
};

const getConceptTokens = (concept) => tokenize(concept)
  .filter((token) => token.length > 2 || !lowInformationPhrases.has(token));

const conceptIsCovered = (text, concept) => {
  const source = normalize(text);
  if (getConceptVariants(concept).some((variant) => source.includes(variant))) return true;
  const tokens = getConceptTokens(concept).filter((token) => token.length === 2);
  if (tokens.length < 2) return false;
  const matched = tokens.filter((token) => source.includes(token)).length;
  return matched >= 2 && matched / tokens.length >= 0.6;
};

const getTextCoveredConcepts = (text, concepts) => {
  const source = normalize(text);
  return concepts.filter((concept) => conceptIsCovered(source, concept)
    || getConceptTokens(concept).some((token) => token.length >= 2 && source.includes(token)));
};

const getCoveredConcepts = (chunk, concepts) => {
  const normalizedTitle = normalize(chunk.title);
  const normalizedSection = normalize(chunk.section);
  const keywordText = (Array.isArray(chunk.keywords) ? chunk.keywords : [])
    .filter((keyword) => {
      const normalizedKeyword = normalize(keyword);
      return normalizedKeyword && normalizedKeyword !== normalizedTitle && normalizedKeyword !== normalizedSection;
    })
    .join(" ");
  const source = normalize(`${chunk.article || ""} ${keywordText} ${chunk.content || ""}`);
  return concepts.filter((concept) => conceptIsCovered(source, concept));
};

const scoreTitle = (title, tokens, concepts) => {
  const source = normalize(title);
  let score = 0;
  concepts.forEach((concept) => {
    if (source.includes(concept)) score += 48;
  });
  tokens.forEach((token) => {
    if (token.length >= 2 && source.includes(token)) score += token.length > 2 ? 12 : 6;
  });
  return score;
};

const scoreChunkContent = (chunk, tokens, concepts, question = "") => {
  const article = normalize(chunk.article);
  const section = normalize(chunk.section);
  const normalizedTitle = normalize(chunk.title);
  const keywords = normalize(Array.isArray(chunk.keywords)
    ? chunk.keywords.filter((keyword) => {
      const normalizedKeyword = normalize(keyword);
      return normalizedKeyword !== normalizedTitle && normalizedKeyword !== section;
    }).join(" ")
    : "");
  const content = normalize(chunk.content);
  let score = 0;
  const matchedTokens = new Set();

  concepts.forEach((concept) => {
    const variants = getConceptVariants(concept);
    if (variants.some((variant) => keywords.includes(variant))) score += 28;
    if (variants.some((variant) => content.includes(variant))) score += 24;
  });
  tokens.forEach((token) => {
    let matched = false;
    if (keywords.includes(token)) { score += 7; matched = true; }
    if (article.includes(token)) { score += 2; matched = true; }
    if (section.includes(token)) { score += 1; matched = true; }
    if (content.includes(token)) {
      score += 2 + Math.min(content.split(token).length - 1, 3);
      matched = true;
    }
    if (matched) matchedTokens.add(token);
  });
  if (matchedTokens.size >= 2) score += matchedTokens.size * 5;
  const intent = getQuestionIntentProfile(question);
  const semanticMatches = matchedTokens.size + concepts.filter((concept) => conceptIsCovered(content, concept)).length;
  const isSemanticallyRelevant = semanticMatches >= 2 || concepts.some((concept) => concept.length >= 3 && content.includes(concept));
  const hasSemanticAnchor = score > 0 || tokens.some((token) => token.length >= 2
    && !lowInformationPhrases.has(token)
    && (normalizedTitle.includes(token) || section.includes(token) || keywords.includes(token)));
  if (hasSemanticAnchor && intent.asksForStudentAction && !intent.asksForOrganization) {
    const actionSignals = ["申请", "条件", "要求", "应当", "必须", "须", "学分", "资格", "期限", "时间", "完成", "办理", "认定", "标准", "处分", "后果"];
    const actionMatches = actionSignals.filter((signal) => content.includes(signal)).length;
    score += Math.min(actionMatches * 6, 36);
    if (/领导小组|组织机构|工作组|工作职责|职责分工|负责制度的制定|统筹规划/.test(content)) {
      score -= 40;
    }
  }
  // Structural wrappers and repeal/effective-date clauses are useful context,
  // but should not crowd out substantive conditions, procedures or sanctions.
  if (!article && /第[一二三四五六七八九十百零〇0-9]+[章节编部分]|总则|附则/.test(content)) score *= 0.55;
  if (/废止|自发布之日起(?:施行|执行)|负责解释/.test(content)) score *= 0.35;
  const structure = getChunkStructureProfile(chunk);
  if (structure.isBackground && (intent.asksForStudentAction || intent.conditionIntent)
    && !intent.asksForOrganization) score *= 0.4;
  if (!article && /第[一二三四五六七八九十]+章[^。]{0,30}$/.test(content)) score *= 0.4;
  if (structure.isPrinciple && (intent.quantitativeIntent || intent.deadlineIntent
    || intent.sanctionIntent || intent.exceptionIntent || intent.asksForStudentAction)) score *= 0.72;
  if (isSemanticallyRelevant) {
    if (intent.quantitativeIntent && structure.hasQuantity) score += 42;
    const requestedUnits = getRequestedQuantityUnits(question);
    if (intent.quantitativeIntent && requestedUnits.length
      && requestedUnits.some((unit) => structure.quantities.some((value) => value.includes(unit)))) score += 54;
    if (intent.deadlineIntent && structure.hasDeadline) score += 34;
    if (intent.sanctionIntent && structure.hasSanction) score += 42;
    if (intent.exceptionIntent && structure.hasException) score += 30;
    if (intent.conditionIntent && structure.hasCondition) score += 38;
    if (intent.asksForStudentAction && structure.hasAnswerSignal) score += 18;
    if (structure.isAttachment && (intent.quantitativeIntent || intent.deadlineIntent) && structure.hasQuantity) score += 24;
  }
  const normalizedQuestion = normalize(question);
  if (/本科毕业/.test(normalizedQuestion) && !/学位/.test(normalizedQuestion)
    && /学士学位|学位授予/.test(`${normalizedTitle}${content}`)) score *= 0.45;
  if (/学士学位|学位证/.test(normalizedQuestion) && /学士学位授予/.test(normalizedTitle)) score += 36;
  if (/学生干部/.test(normalizedQuestion) && /学生骨干/.test(normalizedTitle)) score += 90;
  if (/产生|选拔|怎么选/.test(normalizedQuestion) && /选拔|选举产生|公开竞聘/.test(content)) score += 36;
  if (/(?:要求|标准|条件|最低|至少|多少分|几分)/.test(normalizedQuestion)
    && /过渡期|当学年|本学年|当前学年/.test(content)) score += 48;
  if (/申请/.test(normalizedQuestion) && /申请/.test(content) && structure.hasDeadline) score += 84;
  if (/公示/.test(normalizedQuestion) && /公示/.test(content) && structure.hasDeadline) score += 72;
  if (/本科毕业/.test(normalizedQuestion) && /准予毕业/.test(content)) score += 180;
  if (/最晚|截止|什么时候申请/.test(normalizedQuestion) && /申请/.test(content) && /日前|截止|最晚/.test(content)) score += 72;
  if (/申诉期限/.test(normalizedQuestion) && /提出书面申诉/.test(content)) score += 84;
  if (/违规电器|用电/.test(normalizedQuestion) && /住宿用电|功率达\s*300w|禁止使用的电器/i.test(content)) score += 84;
  if (/学生干部/.test(normalizedQuestion) && /成绩/.test(normalizedQuestion)
    && /学生骨干/.test(normalizedTitle) && /学习优秀|学习成绩/.test(content)) score += 72;
  if (/分类|几类|a到f|a-f/.test(normalizedQuestion)
    && /划分为a、b、c、d、e、f六类|a类：/i.test(content)) score += 96;
  if (/分等级|困难等级/.test(normalizedQuestion) && /认定为.{0,8}困难等级/.test(content)) score += 120;
  if (/转专业/.test(normalizedQuestion) && /转专业实施管理办法/.test(normalizedTitle)) score += 100;
  if (/本科[^。？]{0,12}(?:毕业|学分)/.test(normalizedQuestion)
    && /本科生学籍管理规定/.test(normalizedTitle)) score += 100;
  if (structure.isPrinciple && hasSemanticAnchor
    && !intent.quantitativeIntent && !intent.deadlineIntent
    && !intent.sanctionIntent && !intent.exceptionIntent && !intent.conditionIntent) score += 42;
  return score;
};

const scoreChunk = (chunk, tokens, question) => {
  const title = String(chunk.title || "");
  const section = String(chunk.section || "");
  const article = String(chunk.article || "");
  const content = String(chunk.content || "");
  const keywords = Array.isArray(chunk.keywords) ? chunk.keywords.join(" ") : "";
  const normalizedQuestion = normalize(question);
  const normalizedTitle = normalize(title);
  const normalizedSection = normalize(section);
  const normalizedArticle = normalize(article);
  const normalizedKeywords = normalize(keywords);
  const normalizedContent = normalize(content);
  const phrases = getQuestionPhrases(question);
  let score = 0;
  const matchedTokens = new Set();
  const matchedPhrases = new Set();
  let strongMatch = false;

  if (normalizedTitle && normalizedQuestion.includes(normalizedTitle)) {
    score += 80;
    strongMatch = true;
  }

  phrases.forEach((phrase) => {
    if (normalizedTitle.includes(phrase)) { score += 36; strongMatch = true; matchedPhrases.add(phrase); }
    if (normalizedKeywords.includes(phrase)) { score += 24; strongMatch = true; matchedPhrases.add(phrase); }
    if (normalizedContent.includes(phrase)) { score += 18; strongMatch = true; matchedPhrases.add(phrase); }
    const phraseChars = Array.from(new Set(phrase.match(/[\u4e00-\u9fa5]/g) || []));
    const titleCharMatches = phraseChars.filter((character) => normalizedTitle.includes(character)).length;
    if (phraseChars.length >= 2 && titleCharMatches / phraseChars.length >= 0.5) {
      score += 24;
      strongMatch = true;
    }
  });

  tokens.forEach((token) => {
    let matched = false;
    if (normalizedTitle.includes(token)) { score += 12; matched = true; }
    if (normalizedKeywords.includes(token)) { score += 8; matched = true; }
    if (normalizedSection.includes(token)) { score += 3; matched = true; }
    if (normalizedArticle.includes(token)) { score += 2; matched = true; }
    if (normalizedContent.includes(token)) {
      const occurrences = normalizedContent.split(token).length - 1;
      score += 1 + Math.min(occurrences, 4) * 2;
      matched = true;
    }
    if (matched) matchedTokens.add(token);
  });

  if (matchedTokens.size >= 2) score += matchedTokens.size * 8;
  if (phrases.length >= 2 && matchedPhrases.size === phrases.length) score += 60;

  if (normalizedQuestion.length >= 2 && normalizedContent.includes(normalizedQuestion)) {
    score += 50;
    strongMatch = true;
  }

  return strongMatch || matchedTokens.size >= 2 ? score : 0;
};

const startsNewArticle = (current, next) => {
  const currentArticle = String(current && current.article || "").trim();
  const nextArticle = String(next && next.article || "").trim();
  if (!nextArticle || nextArticle === currentArticle) return false;
  const content = String(next.content || "").trimStart();
  return content.startsWith(nextArticle) && /^\s/.test(content.slice(nextArticle.length));
};

const continuesPageEnumeration = (current, next) => {
  if (!current || !next || String(current.title || "") !== String(next.title || "")) return false;
  if (String(next.article || "").trim()) return false;
  const currentText = String(current.content || "").trim();
  const nextText = String(next.content || "").trim();
  return /[：:；;，,]$/.test(currentText)
    && /^(?:[（(]?[一二三四五六七八九十\d]+[）).、]|[a-fA-F]类|\d+\.)/.test(nextText);
};

const rankChunks = (chunks, question, limit) => {
  if (isUnderspecifiedQuestion(question)) return [];
  const tokens = tokenize(question);
  const concepts = getQuestionPhrases(question);
  const semanticTokens = tokens.filter((token) => token.length >= 2
    && !/^\d+(?:\.\d+)?$/.test(token)
    && !/^(?:分|元|天|日|月|年|次|册|本|小时|学分|工作日|个工作日|元\/小时|%|％)$/.test(token)
    && !lowInformationPhrases.has(token));
  const asksForGraduate = /研究生|硕士|博士/.test(String(question || ""));
  const sourceChunks = (Array.isArray(chunks) ? chunks : []).filter((chunk) =>
    asksForGraduate || (!/研究生/.test(String(chunk.title || ""))
      && !/(?:^|\n)\s*第[一二三四五六七八九十百零〇0-9]+条\s*全日制研究生|研究生作为/.test(String(chunk.content || ""))));
  const ordered = [...sourceChunks].sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
  const orderedIndexes = new Map(ordered.map((chunk, index) => [chunk, index]));
  const withContinuationPreview = (chunk) => {
    const contents = [String(chunk.content || "")];
    let current = chunk;
    let index = orderedIndexes.get(chunk);
    let additions = 0;
    while (index >= 0 && additions < 3 && endsWithContinuation(current.content)) {
      const next = ordered[index + 1];
      if (!next || String(next.title || "") !== String(chunk.title || "")) break;
      if (startsNewArticle(current, next)) break;
      contents.push(String(next.content || ""));
      current = next;
      index += 1;
      additions += 1;
    }
    return contents.length === 1 ? chunk : { ...chunk, content: contents.join("\n") };
  };
  const candidates = sourceChunks.map((chunk) => {
    const scoringChunk = withContinuationPreview(chunk);
    const semanticSource = normalize(`${scoringChunk.title || ""} ${scoringChunk.article || ""} ${scoringChunk.content || ""}`);
    return ({
    chunk,
    // Production chunks always contain body metadata. Keep a deterministic
    // title-only fallback for diagnostics/legacy fixtures without allowing a
    // document title to inflate every real chunk in that document.
    contentScore: scoreChunkContent(scoringChunk, tokens, concepts, question)
      || (!chunk.content && !chunk.article && !chunk.section && !chunk.keywords
        ? Math.min(scoreTitle(chunk.title, tokens, concepts), minScore)
        : 0),
    coveredConcepts: getCoveredConcepts(scoringChunk, concepts),
    titleCoveredConcepts: concepts.filter((concept) => conceptIsCovered(normalize(scoringChunk.title), concept)
      || (/申请|办理/.test(concept) && normalize(scoringChunk.title).includes(concept.slice(-2)))),
    structure: getChunkStructureProfile(scoringChunk),
    semanticMatchCount: semanticTokens.filter((token) => semanticSource.includes(token)).length,
  });
  });
  const documents = new Map();
  candidates.forEach((candidate) => {
    const title = String(candidate.chunk.title || candidate.chunk.section || "");
    const current = documents.get(title) || {
      title,
      titleScore: scoreTitle(title, tokens, concepts),
      titleConcepts: getTextCoveredConcepts(title, concepts),
      maxContentScore: 0,
      coveredConcepts: new Set(),
      hasIntentEvidence: false,
    };
    current.maxContentScore = Math.max(current.maxContentScore, candidate.contentScore);
    candidate.coveredConcepts.forEach((concept) => current.coveredConcepts.add(concept));
    const intent = getQuestionIntentProfile(question);
    current.hasIntentEvidence ||= (intent.quantitativeIntent && candidate.structure.hasQuantity)
      || (intent.deadlineIntent && candidate.structure.hasDeadline)
      || (intent.sanctionIntent && candidate.structure.hasSanction)
      || (intent.exceptionIntent && candidate.structure.hasException);
    documents.set(title, current);
  });
  const rankedDocuments = Array.from(documents.values()).map((document) => ({
    ...document,
    score: document.titleScore * 3 + Math.min(document.maxContentScore, 120) + document.coveredConcepts.size * 24,
  })).filter((document) => document.score >= minScore).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  if (!rankedDocuments.length) return [];

  const bestDocumentScore = rankedDocuments[0].score;
  const primaryTitleConcepts = new Set(rankedDocuments[0].titleConcepts);
  const intent = getQuestionIntentProfile(question);
  const requestedUnits = getRequestedQuantityUnits(question);
  const selectedDocuments = rankedDocuments.filter((document, index) => index === 0
    || (document.titleScore > 0 && (
      document.score >= bestDocumentScore * documentScoreRatio
      || document.titleConcepts.some((concept) => !primaryTitleConcepts.has(concept))
    ))
    || (index < 5 && document.hasIntentEvidence
      && document.score >= bestDocumentScore * 0.38));
  const selectedTitles = new Set(selectedDocuments.map((document) => document.title));
  const documentScores = new Map(selectedDocuments.map((document) => [document.title, document.score]));
  const documentRanks = new Map(selectedDocuments.map((document, index) => [document.title, index]));
  const documentMaxScores = new Map();
  candidates.forEach((candidate) => {
    const title = String(candidate.chunk.title || candidate.chunk.section || "");
    if (!selectedTitles.has(title)) return;
    documentMaxScores.set(title, Math.max(documentMaxScores.get(title) || 0, candidate.contentScore));
  });
  const pool = candidates.filter((candidate) => {
    const title = String(candidate.chunk.title || candidate.chunk.section || "");
    if (!selectedTitles.has(title) || candidate.contentScore < minScore) return false;
    const documentBest = documentMaxScores.get(title) || 0;
    const passesStandardRatio = candidate.contentScore >= documentBest * relativeScoreRatio;
    const fillsConceptGap = concepts.length > 1
      && candidate.coveredConcepts.length > 0
      && candidate.contentScore >= documentBest * 0.45;
    const suppliesSpecificEvidence = (candidate.coveredConcepts.length > 0 || candidate.semanticMatchCount >= 2)
      && candidate.contentScore >= Math.max(minScore, documentBest * 0.38)
      && ((intent.quantitativeIntent && candidate.structure.hasQuantity)
        || (intent.deadlineIntent && candidate.structure.hasDeadline)
        || (intent.sanctionIntent && candidate.structure.hasSanction)
        || (intent.exceptionIntent && candidate.structure.hasException));
    return passesStandardRatio || fillsConceptGap || suppliesSpecificEvidence;
  })
    .map((candidate) => {
      const title = String(candidate.chunk.title || candidate.chunk.section || "");
      const documentRank = documentRanks.get(title) || 0;
      return {
        ...candidate,
        documentRank,
        score: candidate.contentScore
          + Math.min(documentScores.get(title) || 0, 60) * 0.15
          + (documentRank === 0 ? 60 : Math.max(0, 24 - documentRank * 6)),
      };
    })
    .sort((a, b) => b.score - a.score
      || (Number(a.chunk.sort) || 0) - (Number(b.chunk.sort) || 0)
      || String(a.chunk._id || "").localeCompare(String(b.chunk._id || "")));
  if (!pool.length) return [];

  const selected = [];
  const selectedKeys = new Set();
  const covered = new Set();
  const hardLimit = Math.max(1, Number(limit) || 1) + conceptSupplementLimit;

  // Represent a secondary document only when its title contributes a concept
  // absent from higher-ranked document titles. This preserves cross-policy
  // questions without allowing loosely related documents to consume slots.
  const representedTitleConcepts = new Set();
  selectedDocuments.forEach((document, documentIndex) => {
    if (selected.length >= Math.max(1, Number(limit) || 1)) return;
    const addsTitleConcept = document.titleConcepts.some((concept) => !representedTitleConcepts.has(concept));
    if (documentIndex > 0 && !addsTitleConcept) return;
    const candidate = pool.filter((item) => item.documentRank === documentIndex && !selectedKeys.has(item.chunk))
      .sort((a, b) => b.score - a.score
        || (Number(a.chunk.sort) || 0) - (Number(b.chunk.sort) || 0)
        || String(a.chunk._id || "").localeCompare(String(b.chunk._id || "")))[0];
    if (!candidate) return;
    selected.push(candidate);
    selectedKeys.add(candidate.chunk);
    candidate.coveredConcepts.forEach((concept) => covered.add(concept));
    document.titleConcepts.forEach((concept) => representedTitleConcepts.add(concept));
  });

  while (selected.length < hardLimit) {
    const remainingConcepts = concepts.filter((concept) => !covered.has(concept));
    const available = pool.filter((candidate) => !selectedKeys.has(candidate.chunk));
    if (!available.length) break;
    const best = available.map((candidate) => ({
      candidate,
      newCoverage: candidate.coveredConcepts.filter((concept) => remainingConcepts.includes(concept)).length,
    })).sort((a, b) => b.newCoverage - a.newCoverage
      || a.candidate.documentRank - b.candidate.documentRank
      || b.candidate.score - a.candidate.score
      || (Number(a.candidate.chunk.sort) || 0) - (Number(b.candidate.chunk.sort) || 0)
      || String(a.candidate.chunk._id || "").localeCompare(String(b.candidate.chunk._id || "")))[0];
    if (selected.length >= limit && best.newCoverage === 0) break;
    selected.push(best.candidate);
    selectedKeys.add(best.candidate.chunk);
    best.candidate.coveredConcepts.forEach((concept) => covered.add(concept));
  }

  // A title-heavy principle clause is useful routing context, but it is not a
  // complete answer to a concrete question. Fill a missing evidence type from
  // the already bounded candidate pool without increasing the hard cap.
  const selectedHas = (predicate) => selected.some((candidate) => predicate(candidate.structure));
  const evidenceNeeds = [
    [intent.quantitativeIntent, (profile) => profile.hasQuantity
      && (!requestedUnits.length || requestedUnits.some((unit) => profile.quantities.some((value) => value.includes(unit))))],
    [intent.deadlineIntent, (profile) => profile.hasDeadline],
    [intent.sanctionIntent, (profile) => profile.hasSanction],
    [intent.exceptionIntent, (profile) => profile.hasException],
    [intent.conditionIntent, (profile) => profile.hasCondition],
  ];
  evidenceNeeds.forEach(([needed, predicate]) => {
    if (!needed) return;
    const evidenceCandidates = candidates.filter((candidate) => selectedTitles.has(String(candidate.chunk.title || candidate.chunk.section || ""))
      && candidate.contentScore >= minScore
      && predicate(candidate.structure)
      && (candidate.coveredConcepts.length > 0 || candidate.semanticMatchCount >= 2))
      .sort((a, b) => {
        const aUnitCoverage = requestedUnits.filter((unit) => a.structure.quantities.some((value) => value.includes(unit))).length;
        const bUnitCoverage = requestedUnits.filter((unit) => b.structure.quantities.some((value) => value.includes(unit))).length;
        return bUnitCoverage - aUnitCoverage
        || b.contentScore - a.contentScore
        || b.coveredConcepts.length - a.coveredConcepts.length
        || b.semanticMatchCount - a.semanticMatchCount
        || (Number(a.chunk.sort) || 0) - (Number(b.chunk.sort) || 0);
      });
    const supplement = evidenceCandidates.find((candidate) => !selectedKeys.has(candidate.chunk));
    if (!supplement) return;
    const selectedEvidence = selected.filter((candidate) => predicate(candidate.structure))
      .sort((a, b) => b.semanticMatchCount - a.semanticMatchCount
        || b.contentScore - a.contentScore)[0];
    if (selectedEvidence
      && selectedEvidence.semanticMatchCount >= supplement.semanticMatchCount
      && selectedEvidence.contentScore >= supplement.contentScore * 1.15) return;
    selected.push({
      ...supplement,
      documentRank: documentRanks.get(String(supplement.chunk.title || supplement.chunk.section || "")) ?? selectedDocuments.length,
      score: supplement.contentScore + 80,
    });
    selectedKeys.add(supplement.chunk);
  });

  const sortedSelected = selected.sort((a, b) => b.score - a.score
    || b.semanticMatchCount - a.semanticMatchCount
    || (Number(a.chunk.sort) || 0) - (Number(b.chunk.sort) || 0)).slice(0, hardLimit);
  const marginalKeys = new Set();
  const marginalSelected = [];
  const redundantCandidates = [];
  const evidenceFloor = Math.min(4, Math.max(1, Number(limit) || 1));
  sortedSelected.forEach((candidate) => {
    const keys = getMarginalInformationKeys(candidate, intent, requestedUnits);
    const added = Array.from(keys).filter((key) => !marginalKeys.has(key));
    const candidateTitle = String(candidate.chunk.title || candidate.chunk.section || "");
    const representedTitles = new Set(marginalSelected.map((item) => String(item.chunk.title || item.chunk.section || "")));
    const substantiveAdded = added.filter((key) => !key.startsWith("flow:"));
    const isRedundantSecondaryPolicy = marginalSelected.length > 0
      && !representedTitles.has(candidateTitle)
      && substantiveAdded.length === 0;
    if ((marginalSelected.length >= evidenceFloor && added.length === 0) || isRedundantSecondaryPolicy) {
      redundantCandidates.push(candidate);
      return;
    }
    added.forEach((key) => marginalKeys.add(key));
    marginalSelected.push({ ...candidate, marginalCoverageAdded: added });
  });
  const rankedResult = marginalSelected.map((item) => ({
    ...item.chunk,
    retrievalMeta: {
      score: Number(item.score.toFixed(2)),
      contentScore: Number(item.contentScore.toFixed(2)),
      coveredConcepts: item.coveredConcepts,
      marginalCoverageAdded: item.marginalCoverageAdded,
      continuation: false,
    },
  }));
  rankedResult.retrievalDiagnostics = {
    candidatePrimaryCount: sortedSelected.length,
    primaryCount: rankedResult.length,
    redundantChunkCount: redundantCandidates.length,
    marginalCoverageAdded: Array.from(marginalKeys),
  };
  return rankedResult;
};

const endsWithContinuation = (content) => {
  const text = String(content || "").trim();
  if (!text || /[。！？；]$/.test(text)) return false;
  const lastLine = text.split(/\r?\n/).filter((line) => line.trim()).at(-1).trim();
  if (/^第[一二三四五六七八九十百零〇0-9]+[章节编](?:\s+\S+)?$/.test(lastLine)) return false;
  if (/^第[一二三四五六七八九十百零〇0-9]+部分(?:\s+\S+)$/.test(lastLine)) return false;
  if (/^(附件|附表)(?:\s*[一二三四五六七八九十百零〇0-9]+)?(?:[：:].*)?$/.test(lastLine)) return false;
  if (/^(表|图)\s*[一二三四五六七八九十百零〇0-9.-]+(?:[：:].*)?$/.test(lastLine)) return false;
  if (/^(目录|总则|附则|\S{2,30}(规定|办法|细则|方案|章程|指引))$/.test(lastLine)) return false;
  if (/[—-]\s*\d+\s*[—-]$/.test(text)) return false;
  return true;
};

const expandContinuationChunks = (allChunks, rankedChunks, limit) => {
  const ordered = [...(Array.isArray(allChunks) ? allChunks : [])].sort((a, b) =>
    (Number(a.sort) || 0) - (Number(b.sort) || 0)
    || String(a._id || "").localeCompare(String(b._id || "")));
  const result = [];
  const seen = new Set();
  let primaryCount = 0;
  const getKey = (chunk) => String(chunk._id || `${chunk.sort}|${chunk.pageText}|${chunk.content}`);
  const append = (chunk, continuation = false) => {
    const key = getKey(chunk);
    if (!chunk || seen.has(key) || (!continuation && primaryCount >= limit)) return;
    seen.add(key);
    if (!continuation) primaryCount += 1;
    result.push({
      ...chunk,
      retrievalMeta: {
        ...(chunk.retrievalMeta || {}),
        continuation,
      },
    });
  };

  (Array.isArray(rankedChunks) ? rankedChunks : []).forEach((chunk) => {
    if (primaryCount >= limit) return;
    append(chunk);

    let current = chunk;
    let index = ordered.findIndex((candidate) => getKey(candidate) === getKey(current));

    while (index >= 0 && (endsWithContinuation(current.content)
      || continuesPageEnumeration(current, ordered[index + 1]))) {
      const next = ordered[index + 1];
      if (!next || String(next.title || "") !== String(chunk.title || "")) break;
      if (startsNewArticle(current, next)) break;
      append(next, true);
      current = next;
      index += 1;
    }
  });

  return result;
};

module.exports = {
  expandContinuationChunks,
  rankChunks,
  scoreChunk,
  scoreChunkContent,
  scoreTitle,
  stopWords,
  tokenize,
  getCoveredConcepts,
  getQuestionPhrases,
  getQuestionIntentProfile,
  getChunkStructureProfile,
  getMarginalInformationKeys,
  getQuantitativeTokens,
  getRequestedQuantityUnits,
  isUnderspecifiedQuestion,
  minScore,
  relativeScoreRatio,
  documentScoreRatio,
  retrievalVersion,
};
