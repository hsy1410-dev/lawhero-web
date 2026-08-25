import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  serverTimestamp,
  increment,
  arrayUnion,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import "../../styles/admin.css";
import { useNavigate } from "react-router-dom";
import { sendPush } from "../../utils/sendPush";
import {
  getApplicationChannel,
  getApplicationChannelLabel,
  getConsultationPreview,
  getConsultationUserId,
  getPhoneNumber,
} from "../../utils/consultation";

export default function AdminDashboard() {
  const nav = useNavigate();

  const [lastIndex, setLastIndex] = useState(null);
  const [assignedCount, setAssignedCount] = useState(0);
  const [assignedRequests, setAssignedRequests] = useState([]);
  const [assignedRequestsLoading, setAssignedRequestsLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [counselors, setCounselors] = useState([]);

  const [selectedRequests, setSelectedRequests] = useState([]);
  const [selectedCounselors, setSelectedCounselors] = useState([]);
  const [deletingRequests, setDeletingRequests] = useState(false);

  /* ------------------------------------------------------------------
      오늘 배정된 전체 상담 수
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
      전체 대기중 상담 목록
  ------------------------------------------------------------------ */
  useEffect(() => {
    let active = true;
    let snapshotSequence = 0;

    const q = query(
      collection(db, "consult_requests"),
      where("status", "==", "waiting"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, async (snap) => {
      const sequence = ++snapshotSequence;
      const requestList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const userIds = [
        ...new Set(requestList.map(getConsultationUserId).filter(Boolean)),
      ];

      const userEntries = await Promise.all(
        userIds.map(async (userId) => {
          try {
            const userSnap = await getDoc(doc(db, "app_users", userId));
            return [userId, userSnap.exists() ? userSnap.data() : null];
          } catch (error) {
            console.warn(`app_users/${userId} 조회 실패:`, error);
            return [userId, null];
          }
        })
      );

      if (!active || sequence !== snapshotSequence) return;

      const appUsersById = new Map(userEntries);
      setRequests(
        requestList.map((request) => {
          const userId = getConsultationUserId(request);
          return {
            ...request,
            applicantPhone: getPhoneNumber(appUsersById.get(userId), request),
          };
        })
      );
      const visibleRequestIds = new Set(requestList.map((request) => request.id));
      setSelectedRequests((previous) =>
        previous.filter((requestId) => visibleRequestIds.has(requestId))
      );
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  /* ------------------------------------------------------------------
      현재 배정된 상담 내역
  ------------------------------------------------------------------ */
  useEffect(() => {
    setAssignedRequestsLoading(true);

    const q = query(
      collection(db, "consult_requests"),
      where("status", "==", "assigned")
    );

    return onSnapshot(
      q,
      (snap) => {
        const assigned = snap.docs
          .map((requestDoc) => ({ id: requestDoc.id, ...requestDoc.data() }))
          .sort((a, b) => {
            const aTime =
              a.assignedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
            const bTime =
              b.assignedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
            return bTime - aTime;
          });

        setAssignedRequests(assigned);
        setAssignedRequestsLoading(false);
      },
      (error) => {
        console.error("배정된 상담 내역 조회 실패:", error);
        setAssignedRequests([]);
        setAssignedRequestsLoading(false);
      }
    );
  }, []);

  /* ------------------------------------------------------------------
      ⭐ 상담사 리스트
      - 일단 전체 상담사 표시
      - 나중에 필요하면 special/general 별 필터 추가 가능
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
        const counselorId =
          selectedCounselors[
            Math.floor(Math.random() * selectedCounselors.length)
          ];
        const request = requests.find((item) => item.id === requestId);
        const counselor = counselors.find((item) => item.id === counselorId);

        if (!request || !counselor) continue;

        const requestUserId = getConsultationUserId(request);
        if (!requestUserId) {
          console.warn(`상담 요청 ${requestId}에 사용자 UID가 없습니다.`);
          continue;
        }

        const requestSource = getApplicationChannel(request);

        const roomRef = doc(collection(db, "chat_rooms"));
        const assignedAt = Timestamp.now();
        const assignedBy = auth.currentUser?.uid ?? "auto";
        const batch = writeBatch(db);

        batch.set(roomRef, {
          clientId: requestUserId,
          counselorId,
          users: [requestUserId, counselorId],
          requestId,
          shortId: request.shortId ?? requestId.slice(0, 6).toUpperCase(),
          category: request.category ?? "법률 상담",
          applicantPhone: request.applicantPhone ?? "",
          ...(requestSource !== "unknown" ? { requestSource } : {}),
          status: "assigned",
          lastMessage: "",
          lastMessageAt: null,
          createdAt: serverTimestamp(),
        });

        batch.update(doc(db, "consult_requests", requestId), {
          status: "assigned",
          counselorId,
          roomId: roomRef.id,
          assignedCounselor: {
            id: counselorId,
            nickname: counselor.nickname ?? "",
            realName: counselor.realName ?? "",
          },
          assignedAt: serverTimestamp(),
          assignedBy,
          assignmentHistory: arrayUnion({
            action: "assigned",
            counselorId,
            counselorNickname: counselor.nickname ?? counselor.realName ?? "",
            performedBy: assignedBy,
            at: assignedAt,
          }),
        });

        batch.update(doc(db, "users", counselorId), {
          assignedOpenCount: increment(1),
        });

        await batch.commit();

        try {
          await sendPush({
            type: "assign",
            counselorUid: counselorId,
            consultId: requestId,
            message: `새 상담이 배정되었습니다. 상담코드: ${
              request.shortId ?? requestId.slice(0, 6).toUpperCase()
            }`,
          });
        } catch (pushError) {
          console.warn(`상담 요청 ${requestId} 배정 알림 발송 실패:`, pushError);
        }
      }

      alert("자동 배정 완료!");
      setSelectedRequests([]);
    } catch (err) {
      console.error(err);
      alert("배정 실패");
    }
  };

  const deleteSelectedRequests = async () => {
    const requestIds = selectedRequests.filter((requestId) =>
      requests.some((request) => request.id === requestId)
    );

    if (requestIds.length === 0) {
      alert("삭제할 상담 신청을 선택하세요.");
      return;
    }

    const confirmed = window.confirm(
      `선택한 상담 신청 ${requestIds.length}건을 삭제하시겠습니까?\n삭제한 신청은 복구할 수 없습니다.`
    );
    if (!confirmed) return;

    setDeletingRequests(true);

    try {
      for (let index = 0; index < requestIds.length; index += 450) {
        const batch = writeBatch(db);
        requestIds.slice(index, index + 450).forEach((requestId) => {
          batch.delete(doc(db, "consult_requests", requestId));
        });
        await batch.commit();
      }

      setSelectedRequests([]);
      setLastIndex(null);
      alert(`상담 신청 ${requestIds.length}건을 삭제했습니다.`);
    } catch (error) {
      console.error("상담 신청 선택 삭제 실패:", error);
      alert("선택한 상담 신청을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setDeletingRequests(false);
    }
  };

  const allRequestsSelected =
    requests.length > 0 &&
    requests.every((request) => selectedRequests.includes(request.id));

  const toggleAllRequests = () => {
    setSelectedRequests(
      allRequestsSelected ? [] : requests.map((request) => request.id)
    );
    setLastIndex(null);
  };

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

        <div className="admin-card">
          <h3>관리자 권한</h3>
          <p className="big-number">전체</p>
        </div>
      </div>

      <div className="consult-action-bar">
        <span>{selectedRequests.length}건 선택됨</span>
        <button
          type="button"
          className="primary-btn"
          onClick={autoAssign}
          disabled={deletingRequests}
        >
          선택 상담 자동 배정
        </button>
        <button
          type="button"
          className="danger-btn"
          onClick={deleteSelectedRequests}
          disabled={selectedRequests.length === 0 || deletingRequests}
        >
          {deletingRequests ? "삭제 중..." : "선택 상담 삭제"}
        </button>
      </div>

      {/* 상담 요청 리스트 */}
      <section className="section-box">
        <h2 className="section-title">배정 대기중 상담</h2>

        {requests.length === 0 ? (
          <p className="empty-text">대기중인 상담이 없습니다.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>
                  <label className="select-all-requests">
                    <input
                      type="checkbox"
                      checked={allRequestsSelected}
                      onChange={toggleAllRequests}
                      disabled={deletingRequests}
                    />
                    <span>전체 선택</span>
                  </label>
                </th>
                <th>상담 코드</th>
                <th>유형</th>
                <th>세부 유형</th>
                <th>전화번호</th>
                <th>신청 경로</th>
                <th>고객 상담 내용</th>
                <th>관리 대상</th>
                <th>요청 시간</th>
                <th>보기</th>
              </tr>
            </thead>

            <tbody>
              {requests.map((r) => (
                <tr
                  key={r.id}
                  className={selectedRequests.includes(r.id) ? "selected-row" : ""}
                >
                  <td data-label="선택">
                    <input
                      type="checkbox"
                      checked={selectedRequests.includes(r.id)}
                      disabled={deletingRequests}
                      aria-label={`${r.shortId ?? r.id.slice(0, 6).toUpperCase()} 상담 신청 선택`}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const currentIndex = requests.findIndex(
                          (x) => x.id === r.id
                        );

                        if (e.nativeEvent.shiftKey && lastIndex !== null) {
                          const start = Math.min(lastIndex, currentIndex);
                          const end = Math.max(lastIndex, currentIndex);

                          const ids = requests
                            .slice(start, end + 1)
                            .map((x) => x.id);

                          if (checked) {
                            setSelectedRequests((prev) => [
                              ...new Set([...prev, ...ids]),
                            ]);
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

                  <td data-label="상담 코드">{r.shortId ?? r.id.slice(0, 6).toUpperCase()}</td>
                  <td data-label="유형">{r.category ?? "-"}</td>
                  <td data-label="세부 유형">{r.subCategory ?? "없음"}</td>
                  <td data-label="전화번호">{r.applicantPhone || "없음"}</td>
                  <td data-label="신청 경로">{getApplicationChannelLabel(r)}</td>
                  <td data-label="상담 내용" className="consult-preview" title={getConsultationPreview(r, 300)}>
                    {getConsultationPreview(r)}
                  </td>
                  <td data-label="관리 대상">{r.adminTarget ?? "-"}</td>
                  <td data-label="요청 시간">{r.createdAt?.toDate?.().toLocaleString?.() ?? "-"}</td>

                  <td data-label="보기">
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

      {/* 현재 배정된 상담 내역 */}
      <section className="section-box">
        <h2 className="section-title">배정된 상담 내역</h2>

        {assignedRequestsLoading ? (
          <p className="empty-text">배정 내역을 불러오는 중입니다...</p>
        ) : assignedRequests.length === 0 ? (
          <p className="empty-text">현재 배정된 상담이 없습니다.</p>
        ) : (
          <table className="admin-table assigned-consult-table">
            <thead>
              <tr>
                <th>상담 코드</th>
                <th>유형</th>
                <th>세부 유형</th>
                <th>담당 상담사</th>
                <th>배정 시간</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {assignedRequests.map((request) => (
                <tr key={request.id}>
                  <td data-label="상담 코드">
                    {request.shortId ?? request.id.slice(0, 6).toUpperCase()}
                  </td>
                  <td data-label="유형">{request.category ?? "-"}</td>
                  <td data-label="세부 유형">{request.subCategory ?? "없음"}</td>
                  <td data-label="담당 상담사">
                    {request.assignedCounselor?.nickname ||
                      request.assignedCounselor?.realName ||
                      "알 수 없음"}
                  </td>
                  <td data-label="배정 시간">
                    {request.assignedAt?.toDate?.().toLocaleString?.() ?? "-"}
                  </td>
                  <td data-label="관리">
                    <button
                      type="button"
                      className="table-btn"
                      onClick={() => nav(`/admin/consult/${request.id}`)}
                    >
                      취소 · 재배정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 상담사 리스트 */}
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
                      setSelectedCounselors((prev) => [...prev, c.id]);
                    } else {
                      setSelectedCounselors((prev) =>
                        prev.filter((id) => id !== c.id)
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
