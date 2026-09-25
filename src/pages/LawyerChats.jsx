import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import MainLayout from "../layouts/MainLayout";
import "../styles/coupons.css";

export default function LawyerChats({ user, role }) {
  const [result, setResult] = useState({ rooms: [], loading: true, error: "" });
  useEffect(() => onSnapshot(query(collection(db, "chat_rooms"), where(role === "lawyer" ? "lawyerId" : "clientId", "==", user.uid)), (snap) => {
    const rooms = snap.docs.map((entry) => ({ ...entry.data(), id: entry.id }))
      .filter((room) => room.consultType === "lawyer")
      .sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
    setResult({ rooms, loading: false, error: "" });
  }, () => setResult({ rooms: [], loading: false, error: "채팅 목록을 불러오지 못했습니다. 다시 로그인하거나 새로고침해 주세요." })), [user.uid, role]);

  return <MainLayout title={role === "lawyer" ? "의뢰인 채팅" : "변호사 채팅"}>
    <div className="coupon-page"><h2>{role === "lawyer" ? "의뢰인과 상담하기" : "내 변호사 상담"}</h2>
      <p>진행 중인 상담은 쿠폰 추가 사용 없이 이어갈 수 있습니다.</p>
      {role === "user" && <Link to="/lawyers">쿠폰으로 새 변호사 찾기</Link>}
      {result.loading && <p role="status">상담 목록을 불러오는 중...</p>}
      {result.error && <p role="alert" className="coupon-error">{result.error}</p>}
      {!result.loading && !result.error && !result.rooms.length && <p>아직 연결된 변호사 상담이 없습니다.</p>}
      <div className="lawyer-room-list">{result.rooms.map((room) => <Link key={room.id} to={`/chat/${room.id}`} className="lawyer-room-link">
        <div><strong>{role === "lawyer" ? room.clientName || "의뢰인" : room.lawyerName || "담당 변호사"}</strong>
          <p>{room.lastMessage || "상담을 시작해 주세요."}</p></div>
        <div>{room.status === "assigned" ? "상담 중" : "종료"}
          {room.unread?.[user.uid] > 0 && <p>새 메시지 {room.unread[user.uid]}개</p>}</div>
      </Link>)}</div>
    </div>
  </MainLayout>;
}
