// 云函数说明：封装 retrieval-utils 相关的服务端校验与数据处理流程。
const tokenize = (text) => {
  const source = String(text || "").toLowerCase();
  const tokens = source.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{2,}/g) || [];
  const extra = [];

  for (let i = 0; i < source.length - 1; i += 1) {
    const pair = source.slice(i, i + 2);

    if (/^[\u4e00-\u9fa5]{2}$/.test(pair)) {
      extra.push(pair);
    }
  }

  return Array.from(new Set(tokens.concat(extra))).filter((item) => item.length >= 2);
};

const scoreChunk = (chunk, tokens, question) => {
  const title = String(chunk.title || "");
  const section = String(chunk.section || "");
  const article = String(chunk.article || "");
  const content = String(chunk.content || "");
  const keywords = Array.isArray(chunk.keywords) ? chunk.keywords.join(" ") : "";
  const haystack = `${title} ${section} ${article} ${keywords} ${content}`.toLowerCase();
  let score = 0;

  tokens.forEach((token) => {
    if (title.toLowerCase().includes(token)) score += 8;
    if (section.toLowerCase().includes(token)) score += 5;
    if (article.toLowerCase().includes(token)) score += 4;
    if (keywords.toLowerCase().includes(token)) score += 6;
    if (content.toLowerCase().includes(token)) score += 2;
  });

  if (content.includes(question)) score += 12;
  if (haystack.includes(String(question || "").toLowerCase())) score += 10;

  return score;
};

const rankChunks = (chunks, question, limit) => {
  const tokens = tokenize(question);

  return (Array.isArray(chunks) ? chunks : [])
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, tokens, question),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score
      || (Number(a.chunk.sort) || 0) - (Number(b.chunk.sort) || 0)
      || String(a.chunk._id || "").localeCompare(String(b.chunk._id || "")))
    .slice(0, limit)
    .map((item) => item.chunk);
};

const endsWithContinuation = (content) => {
  const text = String(content || "").trim();
  if (!text || /[。！？；]$/.test(text)) return false;
  if (/第[一二三四五六七八九十百零〇0-9]+章[^。！？；]*$/.test(text)) return false;
  if (/[—-]\s*\d+\s*[—-]$/.test(text)) return false;
  return true;
};

const expandContinuationChunks = (allChunks, rankedChunks, limit) => {
  const ordered = [...(Array.isArray(allChunks) ? allChunks : [])].sort((a, b) =>
    (Number(a.sort) || 0) - (Number(b.sort) || 0)
    || String(a._id || "").localeCompare(String(b._id || "")));
  const result = [];
  const seen = new Set();
  const getKey = (chunk) => String(chunk._id || `${chunk.sort}|${chunk.pageText}|${chunk.content}`);
  const append = (chunk) => {
    const key = getKey(chunk);
    if (!chunk || seen.has(key) || result.length >= limit) return;
    seen.add(key);
    result.push(chunk);
  };

  (Array.isArray(rankedChunks) ? rankedChunks : []).forEach((chunk) => {
    if (result.length >= limit) return;
    append(chunk);

    let current = chunk;
    let index = ordered.findIndex((candidate) => getKey(candidate) === getKey(current));

    while (result.length < limit && index >= 0 && endsWithContinuation(current.content)) {
      const next = ordered[index + 1];
      if (!next || String(next.title || "") !== String(chunk.title || "")) break;
      append(next);
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
  tokenize,
};
