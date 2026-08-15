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

const PHONE_FIELDS = [
  "phone",
  "applicantPhone",
  "phoneNumber",
  "mobile",
  "mobilePhone",
  "contactPhone",
];

const SOURCE_FIELDS = [
  "applicationSource",
  "applicationChannel",
  "applySource",
  "requestSource",
  "requestPlatform",
  "source",
  "platform",
  "origin",
  "channel",
  "clientType",
  "clientPlatform",
  "devicePlatform",
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

export function getConsultationUserId(consultation) {
  return (
    consultation?.userId ??
    consultation?.clientId ??
    consultation?.uid ??
    consultation?.user?.uid ??
    null
  );
}

export function getPhoneNumber(...records) {
  for (const record of records) {
    if (!record) continue;

    for (const field of PHONE_FIELDS) {
      const value = record[field];
      if (
        typeof value === "string" &&
        value.trim() &&
        !["unknown", "확인 불가", "-"].includes(value.trim().toLowerCase())
      ) {
        return value.trim();
      }
      if (typeof value === "number") return String(value);
    }
  }

  return "";
}

function getRawApplicationSource(consultation) {
  const candidates = [
    consultation,
    consultation?.metadata,
    consultation?.client,
    consultation?.device,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    for (const field of SOURCE_FIELDS) {
      const value = candidate[field];
      if (
        typeof value === "string" &&
        value.trim() &&
        !["unknown", "확인 불가", "-"].includes(value.trim().toLowerCase())
      ) {
        return value.trim();
      }
    }
  }

  return "";
}

export function getApplicationChannel(consultation) {
  if (!consultation) return "unknown";

  if (
    consultation.isWeb === true ||
    consultation.fromWeb === true ||
    consultation.web === true
  ) {
    return "web";
  }

  if (
    consultation.isApp === true ||
    consultation.fromApp === true ||
    consultation.isNativeApp === true
  ) {
    return "app";
  }

  const source = getRawApplicationSource(consultation).toLowerCase();
  if (!source) return "unknown";

  if (
    ["웹", "web", "website", "browser", "desktop", "pc", "mobileweb", "mobile_web"].includes(source) ||
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.includes("web") ||
    source.includes("browser") ||
    source.includes("vercel")
  ) {
    return "web";
  }

  if (
    ["앱", "app", "native", "mobileapp", "mobile_app", "android", "ios", "iphone", "ipad", "expo"].includes(source) ||
    source.includes("native") ||
    /(^|[^a-z])app([^a-z]|$)/.test(source) ||
    source.includes("android") ||
    source.includes("iphone") ||
    source.includes("ipad") ||
    source.includes("expo")
  ) {
    return "app";
  }

  return "unknown";
}

export function getApplicationChannelLabel(consultation) {
  const channel = getApplicationChannel(consultation);
  if (channel === "web") return "웹";
  if (channel === "app") return "앱";
  return "확인 불가";
}
