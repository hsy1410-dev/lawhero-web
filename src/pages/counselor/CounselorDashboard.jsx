import { useEffect, useState, useCallback } from "react";
import { getDoc } from "firebase/firestore";
import { serverTimestamp } from "firebase/firestore";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { setDoc } from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import "./counselor-dashboard.css";

export default function CounselorDashboard() {
  const nav = useNavigate();
const [isAvailable, setIsAvailable] = useState(true);
  const [counselorUid, setCounselorUid] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
useEffect(() => {
  if (!counselorUid) return;

  const unsub = onSnapshot(
    doc(db, "counselors", counselorUid),
    (snap) => {
      if (snap.exists()) {
        setIsAvailable(snap.data().isAvailable ?? true);
      }
    }
  );

  return unsub;
}, [counselorUid]);
const toggleAvailability = async () => {
  try {
    await setDoc(
      doc(db, "counselors", counselorUid),
      {
        isAvailable: !isAvailable,
        updatedAt: serverTimestamp(),
      },
      { merge: true } // 🔥 문서 없으면 생성, 있으면 업데이트
    );
  } catch (e) {
    console.error("상태 변경 실패", e);
  }
};
  /* ==================================================
     🔐 로그인 UID 확보
  ================================================== */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      console.log("🔥 counselor auth uid:", user?.uid);
      setCounselorUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  /* ==================================================
     📦 상담 목록 구독
  ================================================== */
  useEffect(() => {
    if (!counselorUid) return;

    setLoading(true);

    const q = query(
      collection(db, "chat_rooms"),
      where("counselorId", "==", counselorUid)
    );

   const unsub = onSnapshot(
  q,
  async (snap) => {
    console.log("📦 counselor rooms:", snap.size);

    const list = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const clientId = data.clientId ?? null;

        let nickname = "-";
        let phone = "-";

        if (clientId) {
          try {
            const userSnap = await getDoc(
              doc(db, "app_users", clientId)
            );
            if (userSnap.exists()) {
              const userData = userSnap.data();
              nickname = userData.nickname ?? "-";
              phone = userData.phone ?? "-";
            }
          } catch (e) {
            console.warn("유저 정보 불러오기 실패", e);
          }
        }

       const currentUid = auth.currentUser?.uid;

return {
  id: d.id,
  shortId: data.shortId ?? d.id.substring(0, 6).toUpperCase(),
  clientId,
  nickname,
  phone,
  status: data.status ?? "waiting",
  unreadCount: data.unread?.[currentUid] ?? 0,
  lastMessage: data.lastMessage ?? "",
  lastMessageAt: data.lastMessageAt ?? null,
  createdAt: data.createdAt ?? null,
};
      })
    );

    // 최근순 정렬
    list.sort((a, b) => {
      const aTime =
        a.lastMessageAt?.toMillis?.() ??
        a.createdAt?.toMillis?.() ??
        0;
      const bTime =
        b.lastMessageAt?.toMillis?.() ??
        b.createdAt?.toMillis?.() ??
        0;
      return bTime - aTime;
    });

    setRooms(list);
    setLoading(false);
  },
  (err) => {
    console.error("❌ rooms snapshot error:", err);
    setRooms([]);
    setLoading(false);
  }
);
    return unsub;
  }, [counselorUid]);

  /* ==================================================
     📅 날짜 포맷
  ================================================== */
  const formatDate = (ts) => {
    if (!ts) return "-";
    try {
      return ts.toDate().toLocaleString();
    } catch {
      return "-";
    }
  };

  /* ==================================================
     💬 채팅방 열기
  ================================================== */
 const openRoom = useCallback(
  async (roomId) => {
    try {
      await updateDoc(doc(db, "chat_rooms", roomId), {
        [`unread.${counselorUid}`]: 0,
      });
    } catch (e) {
      console.warn("⚠️ unread reset 실패", e);
    }

    nav(`/counselor/chat/${roomId}`);
  },
  [nav, counselorUid]
);

  /* ==================================================
     🔒 상담 종료
  ================================================== */
  const closeRoom = useCallback(async (e, roomId) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, "chat_rooms", roomId), {
        status: "closed",
      });
    } catch (err) {
      console.error("❌ closeRoom error:", err);
      alert("상담 종료에 실패했습니다.");
    }
  }, []);

  /* ==================================================
     🖥 렌더
  ================================================== */
  return (
    <MainLayout title="상담 목록">
      <div className="page-inner">
        <div style={{ marginBottom: 20 }}>
  <button
    onClick={toggleAvailability}
    style={{
      padding: "10px 16px",
      borderRadius: 8,
      border: "none",
      cursor: "pointer",
      backgroundColor: isAvailable ? "#10B981" : "#EF4444",
      color: "white",
      fontWeight: "bold",
    }}
  >
    {isAvailable ? "🟢 상담 가능" : "🔴 쉬는 시간"}
  </button>
</div>
        <p className="page-description">
          배정된 상담 목록을 확인하고 상담방을 클릭해 채팅을 시작하세요.
        </p>

        {loading && (
          <p style={{ color: "gray" }}>불러오는 중...</p>
        )}

        {!loading && rooms.length === 0 && (
          <div className="empty-box">
            <p>현재 배정된 상담이 없습니다.</p>
          </div>
        )}

        <div className="card-grid">
          
          {rooms.map((room) => (
            <div
              key={room.id}
              className={`room-card
                ${
                  room.unreadCount > 0
                    ? "has-unread"
                    : ""
                }
                ${
                  room.status === "closed"
                    ? "closed"
                    : ""
                }
              `}
              onClick={() => openRoom(room.id)}
            >
              {/* 상담 코드 */}
              <div className="room-header">
                <h3>상담 코드</h3>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                  }}
                >
                                 <span className="room-code">
                    {room.shortId}
                  </span>
                  {room.unreadCount > 0 && (
                    <span className="unread-badge">
                      {room.unreadCount}
                    </span>
                  )}
                </div>
              </div>

              {/* 상태 */}
              <div className="room-status">
  {room.status === "closed" ? (
    <span className="badge badge-gray">
      종료됨
    </span>
  ) : room.status === "waiting" ? (
    <span className="badge badge-yellow">
      대기 중
    </span>
  ) : (
    <span className="badge badge-blue">
      진행 중
    </span>
  )}
</div>

              {/* 마지막 메시지 */}
              <p className="room-last-msg">
                💬{" "}
                {room.lastMessage ||
                  "메시지가 아직 없습니다."}
              </p>

              {/* 최근 시간 */}
              <p className="room-time">
                ⏰ 최근:{" "}
                {formatDate(room.lastMessageAt)}
              </p>

             <p className="room-text">
  👤 사용자: <span>{room.nickname}</span>
</p>

<p className="room-text">
  📞 전화번호: <span>{room.phone}</span>
</p>

              {/* 생성 */}
              <p className="room-time">
                📅 생성: {formatDate(room.createdAt)}
              </p>

              {/* 종료 버튼 */}
           {room.status === "assigned" && (
  <button
    className="close-btn"
    onClick={(e) => closeRoom(e, room.id)}
  >
    상담 종료
  </button>
)}
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}