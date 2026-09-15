const parseModelAnswer = (answer, chunks, expandContinuationChunks) => {
  const raw = String(answer || "").trim();
  const citationIndex = raw.indexOf("依据：");
  const text = (citationIndex < 0 ? raw : raw.slice(0, citationIndex)).trim();
  const markerIndex = text.search(/引用片段[：:]/);
  const markerLine = markerIndex >= 0 ? text.slice(markerIndex).split(/\r?\n/, 1)[0] : "";
  const body = (markerIndex >= 0 ? text.slice(0, markerIndex) : text).trim();
  const indexes = markerLine
    ? Array.from(new Set((markerLine.match(/\d+/g) || []).map(Number)
      .filter((value) => value >= 1 && value <= chunks.length)))
    : [];
  const citedChunks = [];

  indexes.forEach((value) => {
    const chunk = chunks[value - 1];
    if (!chunk) return;
    const safeChunks = typeof expandContinuationChunks === "function"
      ? expandContinuationChunks(chunks, [chunk], 1)
      : [chunk];
    citedChunks.push(...safeChunks);
  });

  const unique = new Map();
  citedChunks.forEach((chunk) => {
    const key = String(chunk._id || `${chunk.sort}|${chunk.pageText}|${chunk.content}`);
    if (!unique.has(key)) unique.set(key, chunk);
  });

  return {
    body,
    citedChunks: Array.from(unique.values()),
    citationValid: indexes.length > 0,
  };
};

module.exports = { parseModelAnswer };
