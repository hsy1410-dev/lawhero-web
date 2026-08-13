// src/utils/sendPush.js

export async function sendPush({
  type,
  message,
  targetUid,
  counselorUid,
  consultId,
  adminTarget,
  waitForReceipts,
}) {
  // ✅ 디버그 로그 (꼭 남겨!)
  console.log("📤 sendPush body:", {
    type,
    targetUid,
    counselorUid,
    consultId,
    adminTarget,
    message,
  });

  const res = await fetch("/api/sendPush", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      targetUid,
      counselorUid,
      consultId,
      adminTarget,
      waitForReceipts,
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
