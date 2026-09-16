// Lightweight, text-only cleanup for the limited Markdown emitted by the assistant.
// It deliberately produces plain text rather than HTML or rich-text nodes.
const stripInlineMarkdown = (value) => String(value || "")
  .replace(/\*\*([^*\n]+)\*\*/g, "$1")
  .replace(/\*\*/g, "")
  .replace(/__([^_\n]+)__/g, "$1")
  .replace(/`([^`\n]+)`/g, "$1")
  .replace(/^\s{0,3}#{1,6}\s+/gm, "");

const splitTableRow = (line) => line.trim()
  .replace(/^\|/, "")
  .replace(/\|$/, "")
  .split("|")
  .map((cell) => stripInlineMarkdown(cell.trim()));

const isTableDivider = (line) => {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
};

const formatTable = (headers, rows) => rows.map((row) => headers
  .map((header, index) => `${header || `第${index + 1}项`}：${row[index] || "-"}`)
  .join("\n"))
  .join("\n\n");

const formatAssistantMessage = (message) => {
  const lines = String(message || "").replace(/\r\n?/g, "\n").split("\n");
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];
    if (line.includes("|") && next && isTableDivider(next)) {
      const headers = splitTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|")) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      if (rows.length) output.push(formatTable(headers, rows));
      else output.push(stripInlineMarkdown(line));
      continue;
    }
    output.push(stripInlineMarkdown(line));
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

module.exports = { formatAssistantMessage };
