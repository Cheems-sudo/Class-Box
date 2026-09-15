const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const configDir = path.join(dataDir, "handbook-config");
const minChunkLength = 180;
const maxChunkLength = 1200;
const fail = (message) => { throw new Error(`[handbook build] ${message}`); };
const cleanText = (text) => String(text || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
const compactText = (text) => cleanText(text).replace(/\s+/g, "");
// “网络管理办法”在旧目录中与正文“网络安全管理办法”不一致；仅在标题核验时忽略该一词差异。
const comparableTitle = (text) => compactText(text).replace(/[()（）“”]/g, "").replace(/安全/g, "");

const loadConfig = (version) => {
  if (!/^\d{4}$/.test(version || "")) fail("usage: node scripts/build-handbook-chunks.js <YYYY>");
  const configPath = path.join(configDir, `${version}.json`);
  if (!fs.existsSync(configPath)) fail(`missing config: ${path.relative(rootDir, configPath)}`);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  ["version", "name", "sourceFileName", "textFileName"].forEach((key) => {
    if (typeof config[key] !== "string" || !config[key].trim()) fail(`invalid config.${key}`);
  });
  if (config.version !== version) fail(`config version ${config.version} does not match ${version}`);
  if (!Number.isInteger(config.pdfPageOffset) || config.pdfPageOffset < 0) fail("invalid config.pdfPageOffset");
  if (!Array.isArray(config.sectionRules) || !config.sectionRules.length) fail("sectionRules is empty");
  if (!Array.isArray(config.titleRules) || !config.titleRules.length) fail("titleRules is empty");
  return config;
};

const validateRules = (config, pages) => {
  const validateOrdered = (rules, numberKey, label) => {
    let previous = 0;
    const seen = new Set();
    rules.forEach((rule, index) => {
      const value = rule[numberKey];
      const name = String(rule.title || rule.section || "").trim();
      if (!Number.isInteger(value) || value < 1 || value <= previous) fail(`${label}[${index}] is not in strictly increasing page order`);
      if (!name || seen.has(name)) fail(`${label}[${index}] has an empty or duplicate name`);
      seen.add(name);
      previous = value;
    });
  };
  validateOrdered(config.sectionRules, "min", "sectionRules");
  validateOrdered(config.titleRules, "page", "titleRules");
  if (config.sectionRules[0].min !== 1 || config.titleRules[0].page !== 1) fail("rules must start at printed page 1");
  config.titleRules.forEach((rule) => {
    const page = pages[rule.page + config.pdfPageOffset - 1];
    if (page === undefined) fail(`title page ${rule.page} is outside the source document`);
    if (!comparableTitle(page).includes(comparableTitle(rule.title))) fail(`title not found on configured start page ${rule.page}: ${rule.title}`);
  });
};

const getRuleValue = (rules, page, numberKey, valueKey) => {
  let value = rules[0][valueKey];
  rules.forEach((rule) => { if (page >= rule[numberKey]) value = rule[valueKey]; });
  return value;
};

const getPrintedPage = (page, pdfPageNumber, offset) => {
  const expected = pdfPageNumber - offset;
  if (expected < 1) return null;
  const numbers = Array.from(page.matchAll(/(?:^|\n)\s*(\d{1,3})\s*(?=\n|$)/g)).map((match) => Number(match[1]));
  if (numbers.filter((number) => number === expected).length !== 1) fail(`PDF page ${pdfPageNumber}: expected printed page marker ${expected}, found [${numbers.join(", ")}]`);
  return expected;
};

const normalizePage = (page, pageText) => {
  let removed = false;
  const lines = String(page).replace(/\r/g, "").split("\n").filter((line) => {
    if (!removed && new RegExp(`^\\s*${pageText}\\s*$`).test(line)) { removed = true; return false; }
    return true;
  });
  if (!removed) fail(`printed page ${pageText}: page marker was not removed`);
  return cleanText(lines.join("\n"));
};

const splitByArticle = (text) => {
  const matches = Array.from(text.matchAll(/(?:^|\n)\s*(第[一二三四五六七八九十百零〇0-9]+条)/g));
  if (!matches.length) return [{ article: "", content: text }];
  const segments = [];
  const prefix = text.slice(0, matches[0].index).trim();
  if (prefix) segments.push({ article: "", content: prefix });
  matches.forEach((match, index) => segments.push({
    article: match[1],
    content: text.slice(match.index, index + 1 < matches.length ? matches[index + 1].index : text.length).trim(),
  }));
  return segments.filter((item) => item.content);
};

const splitLongContent = (segment) => {
  if (segment.content.length <= maxChunkLength) return [segment];
  const parts = [];
  let current = "";
  const push = () => { if (current) parts.push(current.trim()); current = ""; };
  segment.content.split(/(?<=\n)|(?<=[。；！？])/).filter(Boolean).forEach((unit) => {
    let remaining = unit;
    while (remaining.length > maxChunkLength) {
      const capacity = maxChunkLength - current.length - (current ? 1 : 0);
      if (capacity > 0) { current = current ? `${current}\n${remaining.slice(0, capacity)}` : remaining.slice(0, capacity); remaining = remaining.slice(capacity); }
      push();
    }
    if (current && current.length + 1 + remaining.length > maxChunkLength) push();
    current = current ? `${current}\n${remaining}` : remaining;
  });
  push();
  return parts.map((content, index) => ({ article: index === 0 || !segment.article ? segment.article : `${segment.article}（续${index}）`, content }));
};

const mergeShortSegments = (segments) => {
  const merged = [];
  segments.forEach((segment) => {
    const last = merged.at(-1);
    if (last && last.article === segment.article && last.content.length < minChunkLength && last.content.length + segment.content.length + 1 <= maxChunkLength) last.content += `\n${segment.content}`;
    else merged.push({ ...segment });
  });
  return merged;
};

const buildKeywords = (text, title, section, article) => {
  const terms = `${title} ${section} ${article} ${text}`.match(/[\u4e00-\u9fa5]{2,}|[A-Za-z0-9]{2,}/g) || [];
  const stopWords = new Set(["学生", "学校", "规定", "管理", "办法", "应当", "可以", "进行", "或者", "有关", "相关", "佛山", "大学"]);
  const counts = new Map();
  terms.forEach((term) => { if (!stopWords.has(term)) counts.set(term, (counts.get(term) || 0) + 1); });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([term]) => term);
};

const main = () => {
  const config = loadConfig(process.argv[2]);
  const sourcePath = path.join(dataDir, config.textFileName);
  if (!fs.existsSync(sourcePath)) fail(`missing source text: ${path.relative(rootDir, sourcePath)}`);
  const text = fs.readFileSync(sourcePath, "utf8");
  if (!text.includes("\f")) fail("source text has no form-feed page boundaries");
  if (text.includes("\uFFFD")) fail("source text contains Unicode replacement characters");
  const pages = text.split("\f");
  if (pages.at(-1).trim() === "") pages.pop();
  validateRules(config, pages);

  const chunks = [];
  const duplicateKeys = new Set();
  let previousSort = -1;
  pages.forEach((page, pageIndex) => {
    const pageText = getPrintedPage(page, pageIndex + 1, config.pdfPageOffset);
    if (pageText === null) return;
    const content = normalizePage(page, pageText);
    if (!content) fail(`printed page ${pageText} has no extracted body text`);
    const section = getRuleValue(config.sectionRules, pageText, "min", "section");
    const title = getRuleValue(config.titleRules, pageText, "page", "title");
    const emitted = [];
    mergeShortSegments(splitByArticle(content).flatMap(splitLongContent)).forEach((segment, segmentIndex) => {
      const chunkContent = cleanText(segment.content);
      const sort = pageText * 1000 + segmentIndex;
      if (!chunkContent || !Number.isInteger(pageText) || pageText < 1) fail(`invalid chunk at printed page ${pageText}`);
      if (segmentIndex >= 1000 || sort <= previousSort) fail(`sort is not strictly increasing at printed page ${pageText}`);
      previousSort = sort;
      const key = segment.article
        ? `${title}\u0000${segment.article}\u0000${compactText(chunkContent)}`
        : `${title}\u0000page:${pageText}\u0000${compactText(chunkContent)}`;
      if (duplicateKeys.has(key)) fail(`duplicate clause/chunk at printed page ${pageText}: ${segment.article || title}`);
      duplicateKeys.add(key);
      emitted.push(chunkContent);
      chunks.push({ handbookVersion: config.version, section, title, article: segment.article, pageText, content: chunkContent, keywords: buildKeywords(chunkContent, title, section, segment.article), sort, createdAt: new Date().toISOString() });
    });
    if (compactText(emitted.join("\n")) !== compactText(content)) fail(`printed page ${pageText}: chunk reconstruction differs from extracted body`);
  });
  if (!chunks.length || chunks.some((chunk) => chunk.handbookVersion !== config.version)) fail("chunk/version consistency check failed");

  const now = new Date().toISOString();
  const versions = fs.readdirSync(configDir).filter((name) => /^\d{4}\.json$/.test(name)).map((name) => JSON.parse(fs.readFileSync(path.join(configDir, name), "utf8"))).sort((a, b) => a.version.localeCompare(b.version)).map((item) => ({ version: item.version, name: item.name, active: item.version === config.version, sourceFileName: item.sourceFileName, chunkCount: item.version === config.version ? chunks.length : item.chunkCount, importedAt: now, createdAt: now, updatedAt: now }));
  if (versions.filter((item) => item.active).length !== 1 || versions.find((item) => item.version === config.version).chunkCount !== chunks.length) fail("version/chunkCount consistency check failed");
  const chunksPath = path.join(dataDir, `handbook_chunks_${config.version}_import.json`);
  const versionsPath = path.join(dataDir, `handbook_versions_${config.version}_import.json`);
  fs.writeFileSync(chunksPath, `${chunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`, "utf8");
  fs.writeFileSync(versionsPath, `${versions.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  console.log(`Built ${chunks.length} chunks for handbook ${config.version}.`);
  console.log(`Validated ${pages.length - config.pdfPageOffset} printed pages and ${config.titleRules.length} title rules.`);
};

main();
