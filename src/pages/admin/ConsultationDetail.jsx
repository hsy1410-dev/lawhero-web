import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
} from "firebase/firestore";

import { db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import "../../styles/adminDetail.css";
import { sendPush } from "../../utils/sendPush";
import { getConsultationText } from "../../utils/consultation";

export default function ConsultationDetail() {
  const { id } = useParams();
  const nav = useNavigate();

  const [data, setData] = useState(null);
  const [counselors, setCounselors] = useState([]);
  const [selectedCounselor, setSelectedCounselor] =
    useState(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      getDoc(doc(db, "consult_requests", id)),
      getDocs(collection(db, "users")),
    ]).then(([consultSnap, counselorSnap]) => {
      if (!active) return;

      if (consultSnap.exists()) {
        setData({ id: consultSnap.id, ...consultSnap.data() });
      }

      setCounselors(
        counselorSnap.docs
          .map((counselorDoc) => ({ id: counselorDoc.id, ...counselorDoc.data() }))
          .filter((counselor) => counselor.role === "counselor")
      );
    }).catch((error) => {
      console.error("상담 상세 조회 실패:", error);
    });

    return () => {
      active = false;
    };
  }, [id]);

  /* ===============================
     🔥 상담사 배정
  =============================== */
  const assignCounselor = async () => {
    if (!selectedCounselor)
      return alert("상담사를 선택하세요!");
    if (!data) return;

    try {
      console.log("🔥 상담사 배정 시작");

      /* 1️⃣ 채팅방 생성 */
      const roomRef = await addDoc(
        collection(db, "chat_rooms"),
        {
          clientId: data.userId,
          counselorId: selectedCounselor.id,
          users: [data.userId, selectedCounselor.id],
          requestId: id,
          shortId: data.shortId ?? id.slice(0, 6).toUpperCase(),
          category: data.category ?? "법률 상담",
          status: "assigned",
          lastMessage: "",
          lastMessageAt: null,
          createdAt: serverTimestamp(),
        }
      );

      const roomId = roomRef.id;

      /* 2️⃣ consult_requests 업데이트 */
      await updateDoc(doc(db, "consult_requests", id), {
        status: "assigned",
        assignedAt: serverTimestamp(),
        roomId,
        assignedCounselor: {
          id: selectedCounselor.id,
          nickname: selectedCounselor.nickname ?? "",
          realName: selectedCounselor.realName ?? "",
        },
      });

      /* 3️⃣ 상담사에게 푸시 발송 */
      await sendPush({
        type: "assign",
        counselorUid: selectedCounselor.id,
        consultId: id,
        message: `새 상담이 배정되었습니다. 상담코드: ${
          data.shortId ?? id.slice(0, 6).toUpperCase()
        }`,
      });

      alert("상담사가 배정되었습니다!");
      nav(-1);
    } catch (err) {
      console.error("❌ 배정 오류:", err);
      alert("배정 중 오류가 발생했습니다.");
    }
  };

  if (!data) {
    return (
      <MainLayout title="상담 상세 로딩">
        <p>상담 정보를 가져오는 중...</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="상담 상세 정보">
      <div className="detail-container">

        {/* ===== 상담 정보 ===== */}
        <div className="info-box">
          <h2>상담 기본 정보</h2>
          <p><strong>사용자 UID:</strong> {data.userId}</p>
          <p><strong>상담 유형:</strong> {data.category}</p>
          <p><strong>세부 유형:</strong> {data.subCategory ?? "없음"}</p>
          <p>
            <strong>생성 시간:</strong>{" "}
            {data.createdAt
              ? data.createdAt.toDate().toLocaleString()
              : "기록 없음"}
          </p>
          <p>
            <strong>상담 코드:</strong>{" "}
            {data.shortId ?? data.id.slice(0, 6).toUpperCase()}
          </p>
        </div>

        <div className="info-box consultation-content-box">
          <h2>고객이 남긴 상담 내용</h2>
          <p className={getConsultationText(data) ? "consultation-content" : "consultation-content empty"}>
            {getConsultationText(data) || "작성된 상담 내용이 없습니다."}
          </p>
        </div>

        {/* ===== 상담사 배정 ===== */}
        {data.status === "waiting" && (
          <div className="lawyer-select-box">
            <h2>상담사 배정</h2>

            <div className="lawyer-grid">
              {counselors.map((c) => (
                <div
                  key={c.id}
                  className={`lawyer-card ${
                    selectedCounselor?.id === c.id
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setSelectedCounselor(c)
                  }
                >
                  <h3>{c.nickname ?? "닉네임 없음"}</h3>
                  <p>실명: {c.realName ?? "미등록"}</p>
                  <span className="uid">
                    UID: {c.id}
                  </span>
                </div>
              ))}
            </div>

            <button
              className="assign-btn"
              onClick={assignCounselor}
            >
              선택한 상담사에게 배정하기
            </button>
          </div>
        )}

        {/* ===== 이미 배정된 경우 ===== */}
        {data.status === "assigned" && (
          <div className="assigned-box">
            <h2>이미 배정 완료</h2>
            <p>
              담당 상담사:{" "}
              <strong>
                {data.assignedCounselor?.nickname ??
                  "알 수 없음"}
              </strong>
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
