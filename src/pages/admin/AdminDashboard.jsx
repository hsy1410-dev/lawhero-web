import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  serverTimestamp,
  increment,
} from "firebase/firestore";

import { db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import "../../styles/admin.css";
import { useNavigate } from "react-router-dom";

export default function AdminDashboard() {
  const nav = useNavigate();
const [lastIndex, setLastIndex] = useState(null);
  const [assignedCount, setAssignedCount] = useState(0);
  const [requests, setRequests] = useState([]);
  const [counselors, setCounselors] = useState([]);

  const [selectedRequests, setSelectedRequests] = useState([]);
  const [selectedCounselors, setSelectedCounselors] = useState([]);

  /* ------------------------------------------------------------------
      ⭐ 오늘 배정된 상담 수
  ------------------------------------------------------------------ */
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, "consult_requests"),
      where("status", "==", "assigned"),
      where("createdAt", ">=", Timestamp.fromDate(today))
    );

    return onSnapshot(q, (snap) => {
      setAssignedCount(snap.docs.length);
    });
  }, []);

  /* ------------------------------------------------------------------
      ⭐ 대기중 상담 목록
  ------------------------------------------------------------------ */
  useEffect(() => {
    const q = query(
      collection(db, "consult_requests"),
      where("status", "==", "waiting"),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  /* ------------------------------------------------------------------
      ⭐ 상담사 리스트
  ------------------------------------------------------------------ */
  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "counselor"));

    return onSnapshot(q, (snap) => {
      setCounselors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  /* ------------------------------------------------------------------
      ⭐ 자동 배정
  ------------------------------------------------------------------ */
  const autoAssign = async () => {
    if (selectedRequests.length === 0) {
      alert("상담 요청을 선택하세요");
      return;
    }

    if (selectedCounselors.length === 0) {
      alert("상담사를 선택하세요");
      return;
    }

    try {
      for (const requestId of selectedRequests) {
        const randomCounselor =
          selectedCounselors[
            Math.floor(Math.random() * selectedCounselors.length)
          ];

        await updateDoc(doc(db, "consult_requests", requestId), {
          status: "assigned",
          counselorId: randomCounselor,
          assignedAt: serverTimestamp(),
          assignedBy: "auto",
        });

        await updateDoc(doc(db, "users", randomCounselor), {
          assignedOpenCount: increment(1),
        });
      }

      alert("자동 배정 완료!");

      setSelectedRequests([]);
    } catch (err) {
      console.error(err);
      alert("배정 실패");
    }
  };

  /* ------------------------------------------------------------------
      ⭐ UI 렌더링
  ------------------------------------------------------------------ */
  return (
    <MainLayout title="관리자 대시보드">
      {/* 요약 카드 */}
      <div className="admin-cards">
        <div className="admin-card">
          <h3>오늘 배정된 상담</h3>
          <p className="big-number">{assignedCount}</p>
        </div>

        <div className="admin-card">
          <h3>대기중 상담</h3>
          <p className="big-number">{requests.length}</p>
        </div>

        <div className="admin-card">
          <h3>등록된 상담사</h3>
          <p className="big-number">{counselors.length}</p>
        </div>
      </div>

      {/* -----------------------------
          상담 자동 배정 버튼
      ------------------------------ */}

      <div style={{ marginBottom: 20 }}>
        <button className="primary-btn" onClick={autoAssign}>
          선택 상담 자동 배정
        </button>
      </div>

      {/* -----------------------------
          상담 요청 리스트
      ------------------------------ */}

      <section className="section-box">
        <h2 className="section-title">배정 대기중 상담</h2>

        {requests.length === 0 ? (
          <p className="empty-text">대기중인 상담이 없습니다.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>선택</th>
                <th>상담 코드</th>
                <th>유형</th>
                <th>세부 유형</th>
                <th>요청 시간</th>
                <th>보기</th>
              </tr>
            </thead>

            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
  <input
    type="checkbox"
    checked={selectedRequests.includes(r.id)}
    onChange={(e) => {
      const checked = e.target.checked;
      const currentIndex = requests.findIndex((x) => x.id === r.id);

      if (e.nativeEvent.shiftKey && lastIndex !== null) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);

        const ids = requests.slice(start, end + 1).map((x) => x.id);

        if (checked) {
          setSelectedRequests((prev) => [...new Set([...prev, ...ids])]);
        } else {
          setSelectedRequests((prev) =>
            prev.filter((id) => !ids.includes(id))
          );
        }
      } else {
        if (checked) {
          setSelectedRequests((prev) => [...prev, r.id]);
        } else {
          setSelectedRequests((prev) =>
            prev.filter((id) => id !== r.id)
          );
        }
      }

      setLastIndex(currentIndex);
    }}
  />
</td>
                  <td>{r.shortId ?? r.id.slice(0, 6).toUpperCase()}</td>
                  <td>{r.category}</td>
                  <td>{r.subCategory ?? "없음"}</td>
                  <td>{r.createdAt?.toDate?.().toLocaleString?.() ?? "-"}</td>

                  <td>
                    <button
                      className="table-btn"
                      onClick={() => nav(`/admin/consult/${r.id}`)}
                    >
                      상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* -----------------------------
          상담사 리스트
      ------------------------------ */}

      <section className="section-box">
        <h2 className="section-title">상담사 목록</h2>

        {counselors.length === 0 ? (
          <p className="empty-text">등록된 상담사가 없습니다.</p>
        ) : (
          <div className="lawyer-list">
            {counselors.map((c) => (
              <div className="lawyer-card" key={c.id}>
                <input
                  type="checkbox"
                  checked={selectedCounselors.includes(c.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedCounselors([
                        ...selectedCounselors,
                        c.id,
                      ]);
                    } else {
                      setSelectedCounselors(
                        selectedCounselors.filter((id) => id !== c.id)
                      );
                    }
                  }}
                />

                <h3
                  style={{ cursor: "pointer" }}
                  onClick={() => nav(`/admin/counselor/${c.id}`)}
                >
                  {c.realName ? c.realName : "실명 미등록"}
                </h3>

                <p style={{ color: "var(--subtext)", marginTop: "4px" }}>
                  {Array.isArray(c.specialties) && c.specialties.length > 0
                    ? c.specialties.join(" · ")
                    : "전문 분야 미등록"}
                </p>

                <p style={{ marginTop: "8px" }}>
                  📧 {c.email ?? "이메일 없음"}
                </p>

                <p
                  style={{
                    marginTop: "6px",
                    fontSize: "12px",
                    color: "var(--subtext)",
                  }}
                >
                  UID: {c.id}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </MainLayout>
  );
}