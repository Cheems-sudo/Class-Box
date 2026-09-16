const buildRequestCompletionData = (status, details, retrievalVersion, now = new Date()) => {
  const data = { status: String(status || "failed"), updatedAt: now };
  if (!details) return data;
  return {
    ...data,
    outcome: String(details.outcome || ""),
    question: String(details.question || ""),
    answer: String(details.answer || ""),
    retrievalVersion: String(retrievalVersion || ""),
    handbookVersion: String(details.handbookVersion || ""),
    matchedChunks: Array.isArray(details.matchedChunks) ? details.matchedChunks : [],
    completedAt: now,
  };
};

const finishRequestDocument = async (requestDoc, status, details, retrievalVersion, now = new Date()) => {
  const data = buildRequestCompletionData(status, details, retrievalVersion, now);
  await requestDoc.update({ data });
  return data;
};

module.exports = { buildRequestCompletionData, finishRequestDocument };
