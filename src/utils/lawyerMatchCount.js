export function parseMatchCount(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function getMatchCount(value) {
  return parseMatchCount(value) ?? 0;
}

export function formatMatchCount(value) {
  return `${getMatchCount(value).toLocaleString("ko-KR")}회`;
}
