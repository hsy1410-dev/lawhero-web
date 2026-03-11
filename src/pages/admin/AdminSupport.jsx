import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";

import { db } from "../../config/firebase";

export default function AdminSupport() {

  const [tickets, setTickets] = useState([]);
  const [answers, setAnswers] = useState({});

  useEffect(() => {

    const q = query(
      collection(db, "support_requests"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {

      const list = [];

      snapshot.forEach((doc) => {
        list.push({
          id: doc.id,
          ...doc.data()
        });
      });

      setTickets(list);

    });

    return unsubscribe;

  }, []);

  const handleAnswerChange = (id, value) => {
    setAnswers({
      ...answers,
      [id]: value
    });
  };

  const submitAnswer = async (id) => {

    const answer = answers[id];

    if (!answer?.trim()) {
      alert("답변을 입력해주세요.");
      return;
    }

    await updateDoc(
      doc(db, "support_requests", id),
      {
        status: "answered",
        answer: answer.trim(),
        answeredAt: serverTimestamp()
      }
    );

    alert("답변이 등록되었습니다.");

    setAnswers({
      ...answers,
      [id]: ""
    });

  };

  return (

    <div style={{ padding: 30 }}>

      <h2 style={{ marginBottom: 20 }}>
        🛟 고객센터 문의
      </h2>

      {tickets.map((ticket) => (

        <div
          key={ticket.id}
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
            background: "#fff"
          }}
        >

          {/* 제목 */}

          <div
            style={{
              fontWeight: 700,
              fontSize: 16
            }}
          >
            {ticket.title}
          </div>

          {/* 이메일 */}

          <div
            style={{
              fontSize: 13,
              color: "#6B7280",
              marginTop: 4
            }}
          >
            {ticket.email || "익명"}
          </div>

          {/* 내용 */}

          <div
            style={{
              marginTop: 10,
              color: "#374151"
            }}
          >
            {ticket.content}
          </div>

          {/* 상태 */}

          <div
            style={{
              marginTop: 12,
              fontSize: 13
            }}
          >
            상태 :
            {ticket.status === "pending"
              ? " ⏳ 답변 대기중"
              : " ✅ 답변 완료"}
          </div>

          {/* 기존 답변 */}

          {ticket.answer && (

            <div
              style={{
                marginTop: 14,
                background: "#F3F4F6",
                padding: 12,
                borderRadius: 8
              }}
            >

              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 4
                }}
              >
                관리자 답변
              </div>

              <div>
                {ticket.answer}
              </div>

            </div>

          )}

          {/* 답변 입력 */}

          {ticket.status === "pending" && (

            <div style={{ marginTop: 14 }}>

              <textarea
                placeholder="답변을 입력하세요"
                value={answers[ticket.id] || ""}
                onChange={(e) =>
                  handleAnswerChange(ticket.id, e.target.value)
                }
                style={{
                  width: "100%",
                  height: 100,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #E5E7EB",
                  resize: "none"
                }}
              />

              <button
                onClick={() => submitAnswer(ticket.id)}
                style={{
                  marginTop: 8,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#111827",
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                답변 등록
              </button>

            </div>

          )}

        </div>

      ))}

    </div>

  );
}