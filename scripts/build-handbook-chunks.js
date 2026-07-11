// 脚本说明：执行 build-handbook-chunks 所需的数据转换与文件生成流程。
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const sourcePath = path.join(dataDir, "handbook-2025.txt");
const chunksImportPath = path.join(dataDir, "handbook_chunks_2025_import.json");
const versionImportPath = path.join(dataDir, "handbook_versions_2025_import.json");

const handbookVersion = "2025";
const handbookName = "2025年学生手册";
const sourceFileName = "附件2：《2025年学生手册》.pdf";
const minChunkLength = 180;
const maxChunkLength = 1200;

const sectionRules = [
  { min: 1, section: "佛山大学简介" },
  { min: 4, section: "国家法规" },
  { min: 39, section: "研究生教务管理" },
  { min: 121, section: "本科生教务管理" },
  { min: 175, section: "学生日常管理" },
  { min: 357, section: "团委学生会、社团管理、志愿服务、创新创业" },
];

const titleRules = [
  { title: "佛山大学简介", page: 1 },
  { title: "普通高等学校学生管理规定", page: 4 },
  { title: "高等学校校园秩序管理若干规定", page: 23 },
  { title: "学生伤害事故处理办法", page: 28 },
  { title: "普通高等学校学生行为准则", page: 37 },
  { title: "佛山大学研究生学籍管理规定", page: 39 },
  { title: "佛山大学研究生课程教学管理办法", page: 54 },
  { title: "佛山大学研究生课程免修实施办法", page: 63 },
  { title: "佛山大学研究生专业实践(联合培养)管理规定", page: 66 },
  { title: "佛山大学研究生学位论文开题报告实施办法", page: 72 },
  { title: "佛山大学研究生学位论文中期检查实施办法", page: 77 },
  { title: "佛山大学研究生分流实施办法", page: 80 },
  { title: "佛山大学研究生卓越创新项目实施办法", page: 87 },
  { title: "佛山大学研究生学位授予工作细则（试行）", page: 93 },
  { title: "佛山大学学位论文作假行为处理办法实施细则", page: 107 },
  { title: "佛山大学研究生学位论文质量管理办法", page: 112 },
  { title: "佛山大学普通全日制本科生学籍管理规定", page: 121 },
  { title: "佛山大学普通全日制本科生转专业实施管理办法", page: 147 },
  { title: "佛山大学普通全日制本科毕业生学士学位授予工作细则", page: 154 },
  { title: "佛山大学本科生公共选修课管理办法", page: 159 },
  { title: "佛山大学本科生课程考试工作管理规定", page: 163 },
  { title: "佛山大学学生综合测评实施方案", page: 175 },
  { title: "佛山大学学生奖励管理规定", page: 181 },
  { title: "佛山大学全日制本科学生国家奖助学金实施办法", page: 195 },
  { title: "佛山大学学生资助工作实施办法", page: 204 },
  { title: "佛山大学学生校内勤工助学管理办法", page: 225 },
  { title: "佛山大学家庭经济困难学生认定办法", page: 241 },
  { title: "佛山大学学生考勤与请假管理办法", page: 257 },
  { title: "佛山大学学生违纪处分规定", page: 261 },
  { title: "佛山大学全日制研究生国家奖助学金实施办法", page: 288 },
  { title: "佛山大学全日制研究生“三助一辅”实施办法", page: 296 },
  { title: "佛山大学学生档案管理规定", page: 301 },
  { title: "佛山大学学生住宿管理规定", page: 307 },
  { title: "佛山大学学费住宿费收费管理办法", page: 318 },
  { title: "佛山大学心理健康教育与咨询工作管理规定", page: 326 },
  { title: "佛山大学网络管理办法", page: 334 },
  { title: "佛山大学图书馆指南", page: 353 },
  { title: "佛山大学学生会章程", page: 357 },
  { title: "佛山大学研究生会章程", page: 367 },
  { title: "佛山大学“第二课堂成绩单”制度实施办法", page: 375 },
  { title: "佛山大学学生学术基金管理办法", page: 379 },
  { title: "佛山大学学生骨干管理办法", page: 386 },
  { title: "佛山大学学生社团建设管理指引", page: 395 },
  { title: "佛山大学青年志愿服务评比表彰工作指引", page: 402 },
  { title: "佛山大学大学生创新创业孵化基地管理办法", page: 408 },
].sort((a, b) => a.page - b.page);

const cleanText = (text) => String(text || "")
  .replace(/\r/g, "")
  .replace(/[ \t]+/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const compactText = (text) => cleanText(text).replace(/\s+/g, "");

const getSection = (pageText) => {
  let section = sectionRules[0].section;

  sectionRules.forEach((rule) => {
    if (pageText >= rule.min) {
      section = rule.section;
    }
  });

  return section;
};

const getTitle = (pageText) => {
  let title = titleRules[0].title;

  titleRules.forEach((rule) => {
    if (pageText >= rule.page) {
      title = rule.title;
    }
  });

  return title;
};

const getPageText = (page, pageIndex) => {
  const matches = page.match(/(?:^|\n)\s*(\d{1,3})\s*(?:\n|$)/g) || [];
  const lastMatch = matches.length ? matches[matches.length - 1] : "";
  const numberMatch = lastMatch.match(/\d{1,3}/);

  if (numberMatch) {
    return Number(numberMatch[0]);
  }

  return Math.max(1, pageIndex - 2);
};

const normalizePage = (page) => cleanText(page
  .split("\n")
  .filter((line) => !/^\s*\d{1,3}\s*$/.test(line))
  .join("\n"));

const isCatalogPage = (content) => {
  const lines = content.split("\n").filter((line) => line.trim());
  const dottedLines = lines.filter((line) => /\.{6,}/.test(line)).length;

  return /目\s*录/.test(content) || dottedLines >= 4;
};

const splitByArticle = (text) => {
  const articlePattern = /第[一二三四五六七八九十百零〇0-9]+条/g;
  const matches = Array.from(text.matchAll(articlePattern));

  if (!matches.length) {
    return [{ article: "", content: text }];
  }

  const segments = [];
  const prefix = text.slice(0, matches[0].index).trim();

  // 页面开头可能是上一页条款的续文，不能因为不足最小切片长度而丢弃。
  if (prefix) {
    segments.push({ article: "", content: prefix });
  }

  matches.forEach((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    segments.push({
      article: match[0],
      content: text.slice(start, end).trim(),
    });
  });

  return segments.filter((item) => item.content);
};

const splitLongContent = (segment) => {
  if (segment.content.length <= maxChunkLength) {
    return [segment];
  }

  const paragraphs = segment.content.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const parts = [];
  let current = "";

  paragraphs.forEach((paragraph) => {
    if (current && `${current}\n${paragraph}`.length > maxChunkLength) {
      parts.push(current);
      current = paragraph;
      return;
    }

    current = current ? `${current}\n${paragraph}` : paragraph;
  });

  if (current) {
    parts.push(current);
  }

  return parts.map((content, index) => ({
    article: index === 0 ? segment.article : `${segment.article}续`.replace(/^续$/, ""),
    content,
  }));
};

const mergeShortSegments = (segments) => {
  const merged = [];

  segments.forEach((segment) => {
    const last = merged[merged.length - 1];

    const sameArticle = last && String(last.article || "") === String(segment.article || "");
    const likelyInlineArticleReference = last && Boolean(last.article) && last.content.length < 40;

    if ((sameArticle || likelyInlineArticleReference)
      && last.content.length < minChunkLength
      && `${last.content}\n${segment.content}`.length <= maxChunkLength) {
      last.content = `${last.content}\n${segment.content}`;
      return;
    }

    merged.push({ ...segment });
  });

  return merged;
};

const buildKeywords = (text, title, section, article) => {
  const source = `${title} ${section} ${article} ${text}`;
  const terms = source.match(/[\u4e00-\u9fa5]{2,}|[A-Za-z0-9]{2,}/g) || [];
  const stopWords = new Set(["学生", "学校", "规定", "管理", "办法", "应当", "可以", "进行", "或者", "有关", "相关", "佛山", "大学"]);
  const counts = new Map();

  terms.forEach((term) => {
    const value = term.trim();
    if (value.length < 2 || stopWords.has(value)) {
      return;
    }
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term]) => term);
};

const readSource = () => fs.readFileSync(sourcePath, "utf8");

const main = () => {
  const text = readSource();
  const pages = text.split("\f");
  const chunks = [];

  pages.forEach((page, pageIndex) => {
    const pageText = getPageText(page, pageIndex);
    const content = normalizePage(page);

    if (!content || pageText < 1 || isCatalogPage(content)) {
      return;
    }

    const section = getSection(pageText);
    const title = getTitle(pageText);
    const articleSegments = splitByArticle(content).flatMap(splitLongContent);
    const segments = mergeShortSegments(articleSegments);
    const emittedContents = [];

    segments.forEach((segment, segmentIndex) => {
      const chunkContent = cleanText(segment.content);

      if (!chunkContent) {
        return;
      }

      emittedContents.push(chunkContent);

      const article = segment.article.replace("续", "");

      chunks.push({
        handbookVersion,
        section,
        title,
        article,
        pageText,
        content: chunkContent,
        keywords: buildKeywords(chunkContent, title, section, article),
        sort: pageText * 100 + segmentIndex,
        createdAt: new Date(),
      });
    });

    if (compactText(emittedContents.join("\n")) !== compactText(content)) {
      throw new Error(`Page ${pageText} chunk integrity check failed`);
    }
  });

  const version = [{
    version: handbookVersion,
    name: handbookName,
    active: true,
    sourceFileName,
    chunkCount: chunks.length,
    importedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }];

  fs.writeFileSync(chunksImportPath, `${chunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`, "utf8");
  fs.writeFileSync(versionImportPath, `${version.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
};

main();
