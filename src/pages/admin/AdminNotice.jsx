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
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert("📢 공지 푸시 발송 완료");
        setMessage("");
      } else {
        alert("❌ 전송 실패");
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
