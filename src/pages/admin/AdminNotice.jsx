import { useState } from "react";
import "./AdminNotice.css";

export default function AdminNotice() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const sendNotice = async () => {
    if (!message.trim()) {
      alert("공지 내용을 입력하세요");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/sendPush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "notice",
          message,
          waitForReceipts: true,
        }),
      });

      const data = await res.json();
      console.log("📢 notice result:", data);

      const expoAccepted = data.summary?.expo?.success ?? 0;
      const expoReceiptOk = data.summary?.expo?.receipts?.ok ?? null;
      const expoReceiptFailed =
        data.summary?.expo?.receipts?.failed ?? null;
      const expoReceiptPending =
        data.summary?.expo?.receipts?.pending ?? null;
      const expoReceiptErrors = Object.entries(
        data.summary?.expo?.receipts?.errors || {}
      )
        .map(([key, count]) => `${key}: ${count}건`)
        .join(", ");

      if (data.success) {
        const fcmCount = data.summary?.web?.success ?? 0;
        const lines = [
          "📢 공지 푸시 발송 완료",
          `Expo 접수: ${expoAccepted}건`,
          `FCM 성공: ${fcmCount}건`,
        ];

        if (expoReceiptOk !== null) {
          lines.push(`Expo 전달 성공: ${expoReceiptOk}건`);
          lines.push(`Expo 전달 실패: ${expoReceiptFailed}건`);
          lines.push(`Expo 대기중: ${expoReceiptPending}건`);
        }

        if (expoReceiptErrors) {
          lines.push(`Expo 오류: ${expoReceiptErrors}`);
        }

        alert(lines.join("\n"));
        setMessage("");
      } else {
        const expoFailed =
          expoReceiptFailed ?? data.summary?.expo?.failed ?? 0;
        const fcmFailed = data.summary?.web?.failed ?? 0;
        const reason =
          data.error ||
          `Expo 실패: ${expoFailed}건 / FCM 실패: ${fcmFailed}건${
            expoReceiptErrors ? `\nExpo 오류: ${expoReceiptErrors}` : ""
          }`;
        alert(`❌ 전송 실패\n${reason}`);
      }
    } catch (e) {
      console.error(e);
      alert("서버 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-page">
      {/* ---- 상단 요약 카드 ---- */}
      <div className="admin-cards">
        <div className="admin-card">
          <h3>📢 공지 발송</h3>
          <div className="big-number">ADMIN</div>
        </div>
      </div>

      {/* ---- 공지 작성 섹션 ---- */}
      <div className="section-box">
        <h2 className="section-title">공지사항 작성</h2>

        <div className="notice-card">
          <textarea
            className="notice-textarea"
            placeholder="공지 내용을 입력하세요"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
          />

          <div className="notice-actions">
            <button
              className="table-btn"
              onClick={sendNotice}
              disabled={loading}
            >
              {loading ? "전송 중..." : "📤 공지 푸시 보내기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
