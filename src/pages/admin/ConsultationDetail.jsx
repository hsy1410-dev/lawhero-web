import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  collection,
  arrayUnion,
  deleteField,
  increment,
  Timestamp,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import "../../styles/adminDetail.css";
import { sendPush } from "../../utils/sendPush";
import {
  getApplicationChannel,
  getApplicationChannelLabel,
  getConsultationText,
  getConsultationUserId,
  getPhoneNumber,
} from "../../utils/consultation";

export default function ConsultationDetail() {
  const { id } = useParams();

  const [data, setData] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [counselors, setCounselors] = useState([]);
  const [selectedCounselor, setSelectedCounselor] =
    useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const loadDetail = async () => {
      try {
        const [consultSnap, counselorSnap] = await Promise.all([
          getDoc(doc(db, "consult_requests", id)),
          getDocs(collection(db, "users")),
        ]);

        if (!active) return;

        if (consultSnap.exists()) {
          const consultation = { id: consultSnap.id, ...consultSnap.data() };
          setData(consultation);

          const userId = getConsultationUserId(consultation);
          if (userId) {
            try {
              const appUserSnap = await getDoc(doc(db, "app_users", userId));
              if (active) {
                setAppUser(appUserSnap.exists() ? appUserSnap.data() : null);
              }
            } catch (error) {
              console.warn(`app_users/${userId} 조회 실패:`, error);
            }
          }
        }

        if (active) {
          setCounselors(
            counselorSnap.docs
              .map((counselorDoc) => ({ id: counselorDoc.id, ...counselorDoc.data() }))
              .filter((counselor) => counselor.role === "counselor")
          );
        }
      } catch (error) {
        console.error("상담 상세 조회 실패:", error);
      }
    };

    loadDetail();

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

    const requestUserId = getConsultationUserId(data);
    if (!requestUserId) return alert("상담 신청자의 UID를 찾을 수 없습니다.");

    const requestSource = getApplicationChannel(data);
    const assignedBy = auth.currentUser?.uid ?? "admin";
    const assignedAt = Timestamp.now();

    try {
      setIsSaving(true);

      const roomRef = doc(collection(db, "chat_rooms"));
      const batch = writeBatch(db);

      batch.set(roomRef, {
        clientId: requestUserId,
        counselorId: selectedCounselor.id,
        users: [requestUserId, selectedCounselor.id],
        requestId: id,
        shortId: data.shortId ?? id.slice(0, 6).toUpperCase(),
        category: data.category ?? "법률 상담",
        applicantPhone: getPhoneNumber(appUser, data),
        ...(requestSource !== "unknown" ? { requestSource } : {}),
        status: "assigned",
        lastMessage: "",
        lastMessageAt: null,
        createdAt: serverTimestamp(),
      });

      batch.update(doc(db, "consult_requests", id), {
        status: "assigned",
        counselorId: selectedCounselor.id,
        assignedAt: serverTimestamp(),
        assignedBy,
        roomId: roomRef.id,
        assignedCounselor: {
          id: selectedCounselor.id,
          nickname: selectedCounselor.nickname ?? "",
          realName: selectedCounselor.realName ?? "",
        },
        assignmentHistory: arrayUnion({
          action: "assigned",
          counselorId: selectedCounselor.id,
          counselorNickname:
            selectedCounselor.nickname ?? selectedCounselor.realName ?? "",
          performedBy: assignedBy,
          at: assignedAt,
        }),
      });

      batch.update(doc(db, "users", selectedCounselor.id), {
        assignedOpenCount: increment(1),
      });

      await batch.commit();

      try {
        await sendPush({
          type: "assign",
          counselorUid: selectedCounselor.id,
          consultId: id,
          message: `새 상담이 배정되었습니다. 상담코드: ${
            data.shortId ?? id.slice(0, 6).toUpperCase()
          }`,
        });
      } catch (pushError) {
        console.warn("배정 알림 발송 실패:", pushError);
      }

      alert("상담사가 배정되었습니다!");
      setData((previous) => ({
        ...previous,
        status: "assigned",
        counselorId: selectedCounselor.id,
        assignedAt,
        assignedBy,
        roomId: roomRef.id,
        assignedCounselor: {
          id: selectedCounselor.id,
          nickname: selectedCounselor.nickname ?? "",
          realName: selectedCounselor.realName ?? "",
        },
        assignmentHistory: [
          ...(previous.assignmentHistory ?? []),
          {
            action: "assigned",
            counselorId: selectedCounselor.id,
            counselorNickname:
              selectedCounselor.nickname ?? selectedCounselor.realName ?? "",
            performedBy: assignedBy,
            at: assignedAt,
          },
        ],
      }));
      setSelectedCounselor(null);
    } catch (err) {
      console.error("❌ 배정 오류:", err);
      alert("배정 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const cancelAssignment = async () => {
    if (!data || data.status !== "assigned" || isSaving) return;

    const currentCounselorId =
      data.assignedCounselor?.id ?? data.counselorId ?? null;
    const currentCounselorName =
      data.assignedCounselor?.nickname ??
      data.assignedCounselor?.realName ??
      "알 수 없음";

    if (
      !window.confirm(
        `${currentCounselorName} 상담사의 배정을 취소하시겠습니까?\n취소 후 이 상담은 다시 배정 대기 목록으로 이동합니다.`
      )
    ) {
      return;
    }

    const requestUserId = getConsultationUserId(data);
    const performedBy = auth.currentUser?.uid ?? "admin";
    const cancelledAt = Timestamp.now();

    try {
      setIsSaving(true);

      const batch = writeBatch(db);
      const requestRef = doc(db, "consult_requests", id);

      batch.update(requestRef, {
        status: "waiting",
        counselorId: deleteField(),
        roomId: deleteField(),
        assignedCounselor: deleteField(),
        assignedAt: deleteField(),
        assignedBy: deleteField(),
        lastAssignmentCancelledAt: serverTimestamp(),
        lastAssignmentCancelledBy: performedBy,
        assignmentHistory: arrayUnion({
          action: "cancelled",
          counselorId: currentCounselorId ?? "",
          counselorNickname: currentCounselorName,
          performedBy,
          at: cancelledAt,
        }),
      });

      if (data.roomId) {
        const roomRef = doc(db, "chat_rooms", data.roomId);
        const roomSnap = await getDoc(roomRef);

        if (roomSnap.exists()) {
          const roomUpdate = {
            status: "assignment_cancelled",
            counselorId: deleteField(),
            previousCounselorId: currentCounselorId ?? "",
            users: requestUserId ? [requestUserId] : [],
            assignmentCancelledAt: serverTimestamp(),
            assignmentCancelledBy: performedBy,
          };

          if (currentCounselorId) {
            roomUpdate[`unread.${currentCounselorId}`] = deleteField();
          }

          batch.update(roomRef, roomUpdate);
        }
      }

      if (
        currentCounselorId &&
        counselors.some(
          (counselor) =>
            counselor.id === currentCounselorId &&
            Number(counselor.assignedOpenCount ?? 0) > 0
        )
      ) {
        batch.update(doc(db, "users", currentCounselorId), {
          assignedOpenCount: increment(-1),
        });
      }

      await batch.commit();

      setData((previous) => ({
        ...previous,
        status: "waiting",
        counselorId: undefined,
        roomId: undefined,
        assignedCounselor: undefined,
        assignedAt: undefined,
        assignedBy: undefined,
        assignmentHistory: [
          ...(previous.assignmentHistory ?? []),
          {
            action: "cancelled",
            counselorId: currentCounselorId ?? "",
            counselorNickname: currentCounselorName,
            performedBy,
            at: cancelledAt,
          },
        ],
      }));
      setSelectedCounselor(null);
      alert("배정을 취소했습니다. 상담이 배정 대기 상태로 변경되었습니다.");
    } catch (error) {
      console.error("배정 취소 오류:", error);
      alert("배정을 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const reassignCounselor = async () => {
    if (!data || data.status !== "assigned" || isSaving) return;
    if (!selectedCounselor) return alert("새로 배정할 상담사를 선택하세요.");

    const previousCounselorId =
      data.assignedCounselor?.id ?? data.counselorId ?? null;
    if (selectedCounselor.id === previousCounselorId) {
      return alert("현재 담당 상담사와 다른 상담사를 선택하세요.");
    }

    const previousCounselorName =
      data.assignedCounselor?.nickname ??
      data.assignedCounselor?.realName ??
      "알 수 없음";
    if (
      !window.confirm(
        `${previousCounselorName} 상담사에서 ${
          selectedCounselor.nickname ?? selectedCounselor.realName ?? "선택 상담사"
        } 상담사로 재배정하시겠습니까?`
      )
    ) {
      return;
    }

    const requestUserId = getConsultationUserId(data);
    if (!requestUserId) return alert("상담 신청자의 UID를 찾을 수 없습니다.");

    const performedBy = auth.currentUser?.uid ?? "admin";
    const reassignedAt = Timestamp.now();
    const requestSource = getApplicationChannel(data);

    try {
      setIsSaving(true);

      const batch = writeBatch(db);
      let roomRef = data.roomId ? doc(db, "chat_rooms", data.roomId) : null;
      let roomExists = false;

      if (roomRef) {
        roomExists = (await getDoc(roomRef)).exists();
      }

      if (!roomExists) {
        roomRef = doc(collection(db, "chat_rooms"));
        batch.set(roomRef, {
          clientId: requestUserId,
          counselorId: selectedCounselor.id,
          users: [requestUserId, selectedCounselor.id],
          requestId: id,
          shortId: data.shortId ?? id.slice(0, 6).toUpperCase(),
          category: data.category ?? "법률 상담",
          applicantPhone: getPhoneNumber(appUser, data),
          ...(requestSource !== "unknown" ? { requestSource } : {}),
          status: "assigned",
          lastMessage: "",
          lastMessageAt: null,
          createdAt: serverTimestamp(),
          reassignedAt: serverTimestamp(),
          reassignedBy: performedBy,
        });
      } else {
        const roomUpdate = {
          counselorId: selectedCounselor.id,
          previousCounselorId: previousCounselorId ?? "",
          users: [requestUserId, selectedCounselor.id],
          status: "assigned",
          reassignedAt: serverTimestamp(),
          reassignedBy: performedBy,
          [`unread.${selectedCounselor.id}`]: 0,
        };

        if (previousCounselorId) {
          roomUpdate[`unread.${previousCounselorId}`] = deleteField();
        }

        batch.update(roomRef, roomUpdate);
      }

      batch.update(doc(db, "consult_requests", id), {
        status: "assigned",
        counselorId: selectedCounselor.id,
        roomId: roomRef.id,
        assignedCounselor: {
          id: selectedCounselor.id,
          nickname: selectedCounselor.nickname ?? "",
          realName: selectedCounselor.realName ?? "",
        },
        assignedAt: serverTimestamp(),
        assignedBy: performedBy,
        reassignedAt: serverTimestamp(),
        assignmentHistory: arrayUnion({
          action: "reassigned",
          previousCounselorId: previousCounselorId ?? "",
          previousCounselorNickname: previousCounselorName,
          counselorId: selectedCounselor.id,
          counselorNickname:
            selectedCounselor.nickname ?? selectedCounselor.realName ?? "",
          performedBy,
          at: reassignedAt,
        }),
      });

      if (
        previousCounselorId &&
        counselors.some(
          (counselor) =>
            counselor.id === previousCounselorId &&
            Number(counselor.assignedOpenCount ?? 0) > 0
        )
      ) {
        batch.update(doc(db, "users", previousCounselorId), {
          assignedOpenCount: increment(-1),
        });
      }
      batch.update(doc(db, "users", selectedCounselor.id), {
        assignedOpenCount: increment(1),
      });

      await batch.commit();

      try {
        await sendPush({
          type: "assign",
          counselorUid: selectedCounselor.id,
          consultId: id,
          message: `상담이 재배정되었습니다. 상담코드: ${
            data.shortId ?? id.slice(0, 6).toUpperCase()
          }`,
        });
      } catch (pushError) {
        console.warn("재배정 알림 발송 실패:", pushError);
      }

      const nextCounselor = selectedCounselor;
      setData((previous) => ({
        ...previous,
        status: "assigned",
        counselorId: nextCounselor.id,
        roomId: roomRef.id,
        assignedCounselor: {
          id: nextCounselor.id,
          nickname: nextCounselor.nickname ?? "",
          realName: nextCounselor.realName ?? "",
        },
        assignedAt: reassignedAt,
        assignedBy: performedBy,
        reassignedAt,
        assignmentHistory: [
          ...(previous.assignmentHistory ?? []),
          {
            action: "reassigned",
            previousCounselorId: previousCounselorId ?? "",
            previousCounselorNickname: previousCounselorName,
            counselorId: nextCounselor.id,
            counselorNickname:
              nextCounselor.nickname ?? nextCounselor.realName ?? "",
            performedBy,
            at: reassignedAt,
          },
        ],
      }));
      setSelectedCounselor(null);
      alert("상담사를 재배정했습니다.");
    } catch (error) {
      console.error("재배정 오류:", error);
      alert("재배정하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return "-";
    try {
      return timestamp.toDate().toLocaleString();
    } catch {
      return "-";
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
          <p><strong>사용자 UID:</strong> {getConsultationUserId(data) ?? "없음"}</p>
          <p><strong>전화번호:</strong> {getPhoneNumber(appUser, data) || "없음"}</p>
          <p><strong>신청 경로:</strong> {getApplicationChannelLabel(data)}</p>
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
              disabled={isSaving || !selectedCounselor}
            >
              {isSaving ? "처리 중..." : "선택한 상담사에게 배정하기"}
            </button>
          </div>
        )}

        {/* ===== 이미 배정된 경우 ===== */}
        {data.status === "assigned" && (
          <div className="assigned-box">
            <h2>현재 배정 정보</h2>
            <p>
              담당 상담사:{" "}
              <strong>
                {data.assignedCounselor?.nickname ||
                  data.assignedCounselor?.realName ||
                  "알 수 없음"}
              </strong>
            </p>
            <p><strong>배정 시간:</strong> {formatDateTime(data.assignedAt)}</p>

            <div className="assignment-actions">
              <button
                type="button"
                className="cancel-assignment-btn"
                onClick={cancelAssignment}
                disabled={isSaving}
              >
                {isSaving ? "처리 중..." : "배정 취소"}
              </button>
            </div>

            <div className="reassign-section">
              <h3>다른 상담사로 재배정</h3>
              <p className="assignment-help">
                새 담당자를 선택하면 기존 채팅방과 상담 기록은 그대로 유지됩니다.
              </p>
              <div className="lawyer-grid">
                {counselors
                  .filter(
                    (counselor) =>
                      counselor.id !==
                      (data.assignedCounselor?.id ?? data.counselorId)
                  )
                  .map((counselor) => (
                    <button
                      type="button"
                      key={counselor.id}
                      className={`lawyer-card reassign-card ${
                        selectedCounselor?.id === counselor.id ? "selected" : ""
                      }`}
                      onClick={() => setSelectedCounselor(counselor)}
                      disabled={isSaving}
                    >
                      <h3>{counselor.nickname ?? "닉네임 없음"}</h3>
                      <p>실명: {counselor.realName ?? "미등록"}</p>
                      <span className="uid">UID: {counselor.id}</span>
                    </button>
                  ))}
              </div>
              <button
                type="button"
                className="assign-btn"
                onClick={reassignCounselor}
                disabled={isSaving || !selectedCounselor}
              >
                {isSaving ? "처리 중..." : "선택한 상담사로 재배정"}
              </button>
            </div>
          </div>
        )}

        {Array.isArray(data.assignmentHistory) && data.assignmentHistory.length > 0 && (
          <div className="info-box assignment-history-box">
            <h2>배정 변경 기록</h2>
            <ol className="assignment-history-list">
              {[...data.assignmentHistory]
                .sort(
                  (a, b) =>
                    (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0)
                )
                .map((history, index) => (
                  <li key={`${history.at?.toMillis?.() ?? "history"}-${index}`}>
                    <strong>
                      {history.action === "cancelled"
                        ? "배정 취소"
                        : history.action === "reassigned"
                          ? "재배정"
                          : "최초 배정"}
                    </strong>
                    <span>
                      {history.action === "reassigned"
                        ? `${history.previousCounselorNickname || "이전 상담사"} → ${
                            history.counselorNickname || "새 상담사"
                          }`
                        : history.counselorNickname || "상담사 정보 없음"}
                    </span>
                    <time>{formatDateTime(history.at)}</time>
                  </li>
                ))}
            </ol>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
