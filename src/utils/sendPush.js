// src/utils/sendPush.js

export async function sendPush({ type, message, targetUid, consultId }) {
  // ✅ 디버그 로그 (꼭 남겨!)
  console.log("📤 sendPush body:", {
    type,
    targetUid,
    consultId,
    message,
  });

  const res = await fetch("/api/sendPush", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      targetUid, // ✅ chat은 이게 핵심
      consultId,
      message,
    }),
  });

  const data = await res.json();
  console.log("📥 sendPush response:", data);

  // ✅ HTTP 400/500도 로그로 바로 보이게
  if (!res.ok) {
    console.error("❌ sendPush failed:", res.status, data);
  }

  return data;
}