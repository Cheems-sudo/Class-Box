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
const retrievalVersion = "rag-keyword-v3";

const normalize = (text) => String(text || "").toLowerCase().replace(/\s+/g, "");

const getConceptRuns = (text) => normalize(text)
  .replace(/[？?，,。！!；;：:]/g, "|")
  .replace(/是否|有没有|能不能|要不要|是什么|有哪些|有什么|有何|会受到|哪些|什么|怎么|如何|需要|要求|相关情况/g, "|")
  .replace(/学生(?!会)/g, "|")
  .replace(/和|与|及/g, "|")
  .replace(/[吗呢]$/g, "|")
  .split("|")
  .map((part) => part.replace(/(?:管理规定|规定|办法)$/, ""))
  .filter((part) => part.length >= 2 && !stopWords.has(part));

const ambiguousConcepts = new Set(["这个", "那个", "这项", "那项", "此项", "这样", "那样"]);
const getConceptVariants = (concept) => {
  if (concept === "奖励") return ["奖励", "获奖", "奖金"];
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

  return Array.from(new Set(tokens));
};

const getQuestionPhrases = (question) => getConceptRuns(question)
  .filter((phrase) => !lowInformationPhrases.has(phrase));

const getQuestionIntentProfile = (question) => {
  const source = normalize(question);
  const asksForStudentAction = /要求|条件|怎么办|怎么|如何|需要|手续|流程|资格|标准|期限|什么时候/.test(source);
  const asksForOrganization = /谁负责|哪个部门|什么部门|管理机构|组织机构|领导小组|工作组|职责分工/.test(source);
  return { asksForStudentAction, asksForOrganization };
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
  if (intent.asksForStudentAction && !intent.asksForOrganization) {
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

const rankChunks = (chunks, question, limit) => {
  if (isUnderspecifiedQuestion(question)) return [];
  const tokens = tokenize(question);
  const concepts = getQuestionPhrases(question);
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
    };
    current.maxContentScore = Math.max(current.maxContentScore, candidate.contentScore);
    candidate.coveredConcepts.forEach((concept) => current.coveredConcepts.add(concept));
    documents.set(title, current);
  });
  const rankedDocuments = Array.from(documents.values()).map((document) => ({
    ...document,
    score: document.titleScore * 3 + Math.min(document.maxContentScore, 120) + document.coveredConcepts.size * 24,
  })).filter((document) => document.score >= minScore).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  if (!rankedDocuments.length) return [];

  const bestDocumentScore = rankedDocuments[0].score;
  const primaryTitleConcepts = new Set(rankedDocuments[0].titleConcepts);
  const selectedDocuments = rankedDocuments.filter((document, index) => index === 0
    || (document.titleScore > 0 && (
      document.score >= bestDocumentScore * documentScoreRatio
      || document.titleConcepts.some((concept) => !primaryTitleConcepts.has(concept))
    )));
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
    return passesStandardRatio || fillsConceptGap;
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

  return selected.map((item) => ({
    ...item.chunk,
    retrievalMeta: {
      score: Number(item.score.toFixed(2)),
      contentScore: Number(item.contentScore.toFixed(2)),
      coveredConcepts: item.coveredConcepts,
      continuation: false,
    },
  }));
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

    while (index >= 0 && endsWithContinuation(current.content)) {
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
  isUnderspecifiedQuestion,
  minScore,
  relativeScoreRatio,
  documentScoreRatio,
  retrievalVersion,
};
