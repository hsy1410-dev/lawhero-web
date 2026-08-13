const CONSULTATION_TEXT_FIELDS = [
  "content",
  "consultationContent",
  "consultContent",
  "message",
  "description",
  "details",
  "question",
  "requestText",
  "consultation",
];

export function getConsultationText(consultation) {
  if (!consultation) return "";

  for (const field of CONSULTATION_TEXT_FIELDS) {
    const value = consultation[field];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (Array.isArray(value)) {
      const joined = value
        .filter((item) => typeof item === "string" && item.trim())
        .join("\n")
        .trim();
      if (joined) return joined;
    }
  }

  return "";
}

export function getConsultationPreview(consultation, maxLength = 80) {
  const text = getConsultationText(consultation);
  if (!text) return "작성된 상담 내용이 없습니다.";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
