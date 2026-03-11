import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../config/firebase";

export default function AdminCounselors() {
  const [counselors, setCounselors] = useState([]);
  const [selectedCounselor, setSelectedCounselor] = useState(null);
  const [consultations, setConsultations] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
const currentRoom = consultations.find(
  (r) => r.id === selectedRoom
);
  // 🔥 상담사 불러오기
 useEffect(() => {
  const fetchCounselors = async () => {
    const q = query(
      collection(db, "users"),
      where("role", "==", "counselor")
    );

    const snap = await getDocs(q);

    const counselorList = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const updated = await Promise.all(
      counselorList.map(async (counselor) => {
        // ⭐ 리뷰 계산
        const reviewQuery = query(
          collection(db, "reviews"),
          where("counselorId", "==", counselor.id)
        );

        const reviewSnap = await getDocs(reviewQuery);

        let totalRating = 0;
        reviewSnap.docs.forEach((doc) => {
          totalRating += doc.data().rating || 0;
        });

        const ratingCount = reviewSnap.size;
        const ratingAvg =
          ratingCount > 0
            ? (totalRating / ratingCount).toFixed(1)
            : 0;

        // 💬 총 상담 수
        const consultQuery = query(
          collection(db, "chat_rooms"),
          where("counselorId", "==", counselor.id)
        );

        const consultSnap = await getDocs(consultQuery);
        const totalConsultations = consultSnap.size;

        // 🔥 오늘 상담 수
        const todayQuery = query(
          collection(db, "chat_rooms"),
          where("counselorId", "==", counselor.id),
          where("createdAt", ">=", startOfToday)
        );

        const todaySnap = await getDocs(todayQuery);
        const todayCount = todaySnap.size;

        return {
          ...counselor,
          ratingAvg,
          ratingCount,
          totalConsultations,
          todayCount,
        };
      })
    );

    setCounselors(updated);
  };

  fetchCounselors();
}, []);

  // 📊 상담 목록 보기
  const handleViewConsultations = async (uid) => {
    setSelectedCounselor(uid);
    setSelectedRoom(null);
    setMessages([]);

    const q = query(
      collection(db, "chat_rooms"),
      where("counselorId", "==", uid)
    );

    const snap = await getDocs(q);

    setConsultations(
      snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    );
  };

  // 💬 채팅 메시지 보기
  const handleViewMessages = async (roomId) => {
    setSelectedRoom(roomId);

    const msgQuery = query(
      collection(db, "chat_rooms", roomId, "messages")
    );

    const snap = await getDocs(msgQuery);

    setMessages(
      snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    );
  };

  // ⭐ 리뷰 보기
  const handleViewReviews = async (uid) => {
    const q = query(
      collection(db, "reviews"),
      where("counselorId", "==", uid)
    );

    const snap = await getDocs(q);

    setReviews(
      snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    );

    setShowReviewModal(true);
  };

  // 🗑 상담사 삭제 (소프트 삭제)
  const handleDelete = async (uid) => {
    const confirm = window.confirm("정말 상담사를 삭제하시겠습니까?");
    if (!confirm) return;

    try {
      await updateDoc(doc(db, "users", uid), {
        role: "user",
        disabled: true,
      });

      setCounselors((prev) => prev.filter((c) => c.id !== uid));
      alert("상담사가 비활성화되었습니다.");
    } catch (error) {
      console.error(error);
      alert("삭제 중 오류 발생");
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>⭐ 상담사 관리</h2>

      {/* ================= 상담사 목록 ================= */}
      {counselors.map((user) => (
        <div key={user.id} className="card">
          <p><strong>이름:</strong> {user.realName}</p>
<p>평균 별점: ⭐ {user.ratingAvg}</p>
<p>리뷰 수: {user.ratingCount}</p>
<p>총 상담 수: {user.totalConsultations}</p>
<p>🔥 오늘 상담 수: {user.todayCount}</p>

          <div style={{ marginTop: 10 }}>
            <button onClick={() => handleViewConsultations(user.id)}>
              📊 상담 목록 보기
            </button>

            <button
              onClick={() => handleViewReviews(user.id)}
              style={{ marginLeft: 10 }}
            >
              ⭐ 리뷰 보기
            </button>

            <button
              onClick={() => handleDelete(user.id)}
              style={{
                marginLeft: 10,
                backgroundColor: "#EF4444",
                color: "white",
              }}
            >
              🗑 삭제
            </button>
          </div>
        </div>
      ))}

      {/* ================= 상담 목록 ================= */}
      {selectedCounselor && (
        <div style={{ marginTop: 50 }}>
          <h3>📊 상담 목록</h3>

          {consultations.map((room) => (
            <div key={room.id} className="card">
              <p>상담 ID: {room.id}</p>
              <p>상태: {room.status}</p>
              <p>
                날짜:{" "}
                {room.createdAt?.toDate?.().toLocaleString()}
              </p>

              <button
                onClick={() => handleViewMessages(room.id)}
              >
                💬 채팅 기록 보기
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ================= 채팅 메시지 ================= */}
      {selectedRoom && (
  <div style={{ marginTop: 30 }}>
    <h4>💬 채팅 기록</h4>

    {messages.map((msg) => {
      const isClient = msg.senderId === currentRoom?.clientId;
      const isCounselor = msg.senderId === currentRoom?.counselorId;

      return (
        <div
          key={msg.id}
          style={{
            display: "flex",
            justifyContent: isCounselor
              ? "flex-end"
              : "flex-start",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              maxWidth: "70%",
              padding: 12,
              borderRadius: 16,
              backgroundColor: isCounselor
                ? "#4F46E5"   // 상담사 파랑
                : "#E5E7EB",  // 고객 회색
              color: isCounselor ? "white" : "black",
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 4 }}>
              {isCounselor ? "👨‍⚖️ 상담사" : "🙋 고객"}
            </div>

            <div>{msg.text}</div>

            <div
              style={{
                fontSize: 10,
                marginTop: 6,
                opacity: 0.7,
                textAlign: "right",
              }}
            >
              {msg.createdAt?.toDate?.().toLocaleString()}
            </div>
          </div>
        </div>
      );
    })}
  </div>
)}

      {/* ================= 리뷰 모달 ================= */}
      {showReviewModal && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3>⭐ 리뷰 목록</h3>

            {reviews.map((review) => (
              <div key={review.id} className="card">
                <p>⭐ {review.rating} 점</p>
                <p>{review.comment}</p>
                <small>
                  {review.createdAt?.toDate?.().toLocaleString()}
                </small>
              </div>
            ))}

            <button
              onClick={() => setShowReviewModal(false)}
              style={{ marginTop: 20 }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 🔥 모달 스타일
const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  backgroundColor: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const modalStyle = {
  background: "white",
  padding: 30,
  borderRadius: 16,
  width: "500px",
  maxHeight: "80vh",
  overflowY: "auto",
};