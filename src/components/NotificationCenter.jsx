// src/components/NotificationCenter.jsx
import { useNotifications } from "../hooks/useNotificationListener";

export default function NotificationCenter({ user }) {
  const { notifications, markAsRead } = useNotifications(user);

  return (
    <div style={{ padding: "24px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "12px" }}>
        알림 센터
      </h2>

      {notifications.length === 0 && (
        <div style={{ fontSize: "14px", color: "#6b7280" }}>
          아직 알림이 없습니다.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {notifications.map((n) => (
          <div
            key={n.id}
            style={{
              padding: "12px",
              borderRadius: "10px",
              background: n.read ? "#020617" : "#0f172a",
              border: n.read
                ? "1px solid #1f2937"
                : "1px solid rgba(59,130,246,0.6)",
              color: "#e5e7eb",
              fontSize: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "4px",
              }}
            >
              <span>
                {n.type === "consult" && "📩 상담 요청"}
                {n.type === "assign" && "⚖️ 상담 배정"}
                {n.type === "chat" && "💬 채팅"}
              </span>

              {!n.read && (
                <button
                  onClick={() => markAsRead(n.id)}
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    border: "none",
                    background: "#3b82f6",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  읽음 처리
                </button>
              )}
            </div>

            <div>{n.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
