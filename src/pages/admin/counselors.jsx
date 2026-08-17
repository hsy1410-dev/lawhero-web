import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import "../../styles/adminShared.css";
import "../../styles/adminCounselors.css";

const STATUS_LABELS = {
  assigned: "진행 중",
  waiting: "대기 중",
  closed: "종료됨",
};

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;

  const seconds = value.seconds ?? value._seconds;
  if (typeof seconds === "number") return seconds * 1000;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateTime(value) {
  const millis = timestampToMillis(value);
  if (!millis) return "시간 정보 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(millis));
}

function formatMessageTime(value) {
  const millis = timestampToMillis(value);
  if (!millis) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(millis));
}

function formatMessageDate(value) {
  const millis = timestampToMillis(value);
  if (!millis) return "날짜 정보 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(millis));
}

function getMessageSenderId(message) {
  return (
    message.uid ??
    message.senderId ??
    message.senderUid ??
    message.authorId ??
    null
  );
}

function getMessageText(message) {
  const value = message.text ?? message.message ?? message.content;
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return "(내용 없는 메시지)";
}

function getAttachmentUrls(message) {
  const candidates = [
    message.imageUrl,
    message.fileUrl,
    message.attachmentUrl,
    ...(Array.isArray(message.imageUrls) ? message.imageUrls : []),
    ...(Array.isArray(message.attachments)
      ? message.attachments.map((item) =>
          typeof item === "string" ? item : item?.url
        )
      : []),
  ];

  return [...new Set(candidates.filter((url) => typeof url === "string" && url))];
}

function getFriendlyError(error, target) {
  if (error?.code === "permission-denied") {
    return `${target}을(를) 볼 권한이 없습니다. 관리자 계정 권한을 확인해 주세요.`;
  }

  if (error?.message) return error.message;
  return `${target}을(를) 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.`;
}

async function fetchMessagesFromFirestore(roomId) {
  const snap = await getDocs(collection(db, "chat_rooms", roomId, "messages"));
  return snap.docs.map((messageDoc) => ({
    id: messageDoc.id,
    ...messageDoc.data(),
  }));
}

async function fetchMessagesForAdmin(roomId) {
  let apiError = null;

  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("관리자 로그인 정보가 없습니다.");

    const response = await fetch(
      `/api/adminChatHistory?roomId=${encodeURIComponent(roomId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      throw new Error("관리자 채팅 기록 API에 연결하지 못했습니다.");
    }

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "채팅 기록을 불러오지 못했습니다.");
    }

    return Array.isArray(payload.messages) ? payload.messages : [];
  } catch (error) {
    apiError = error;
  }

  // Vite 개발 서버처럼 API 함수가 없는 환경에서도 기존 Firestore 권한으로 확인한다.
  try {
    return await fetchMessagesFromFirestore(roomId);
  } catch (firestoreError) {
    if (firestoreError?.code === "permission-denied") {
      throw new Error(
        "채팅 기록 읽기 권한이 없습니다. 배포된 관리자 API와 Firebase 관리자 환경변수를 확인해 주세요."
      );
    }
    throw apiError ?? firestoreError;
  }
}

export default function AdminCounselors() {
  const [counselors, setCounselors] = useState([]);
  const [counselorsLoading, setCounselorsLoading] = useState(true);
  const [counselorsError, setCounselorsError] = useState("");
  const [selectedCounselor, setSelectedCounselor] = useState(null);
  const [consultations, setConsultations] = useState([]);
  const [consultationsLoading, setConsultationsLoading] = useState(false);
  const [consultationsError, setConsultationsError] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const messageRequestId = useRef(0);

  const currentRoom = consultations.find((room) => room.id === selectedRoomId);

  useEffect(() => {
    let active = true;

    const fetchCounselors = async () => {
      setCounselorsLoading(true);
      setCounselorsError("");

      try {
        const counselorQuery = query(
          collection(db, "users"),
          where("role", "==", "counselor")
        );
        const counselorSnap = await getDocs(counselorQuery);
        const counselorList = counselorSnap.docs.map((userDoc) => ({
          id: userDoc.id,
          ...userDoc.data(),
        }));

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startOfTodayMillis = startOfToday.getTime();

        const enrichedCounselors = await Promise.all(
          counselorList.map(async (counselor) => {
            const [reviewSnap, consultationSnap] = await Promise.all([
              getDocs(
                query(
                  collection(db, "reviews"),
                  where("counselorId", "==", counselor.id)
                )
              ),
              getDocs(
                query(
                  collection(db, "chat_rooms"),
                  where("counselorId", "==", counselor.id)
                )
              ),
            ]);

            const totalRating = reviewSnap.docs.reduce(
              (sum, reviewDoc) => sum + Number(reviewDoc.data().rating || 0),
              0
            );
            const ratingCount = reviewSnap.size;
            const todayCount = consultationSnap.docs.filter(
              (roomDoc) =>
                timestampToMillis(roomDoc.data().createdAt) >= startOfTodayMillis
            ).length;

            return {
              ...counselor,
              ratingAvg:
                ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : "0.0",
              ratingCount,
              totalConsultations: consultationSnap.size,
              todayCount,
            };
          })
        );

        if (active) setCounselors(enrichedCounselors);
      } catch (error) {
        console.error("상담사 목록 조회 실패:", error);
        if (active) setCounselorsError(getFriendlyError(error, "상담사 목록"));
      } finally {
        if (active) setCounselorsLoading(false);
      }
    };

    fetchCounselors();
    return () => {
      active = false;
    };
  }, []);

  const handleViewConsultations = async (counselor) => {
    setSelectedCounselor(counselor);
    setSelectedRoomId(null);
    setMessages([]);
    setMessagesError("");
    setConsultations([]);
    setConsultationsLoading(true);
    setConsultationsError("");

    try {
      const consultationQuery = query(
        collection(db, "chat_rooms"),
        where("counselorId", "==", counselor.id)
      );
      const snap = await getDocs(consultationQuery);
      const rooms = snap.docs
        .map((roomDoc) => ({ id: roomDoc.id, ...roomDoc.data() }))
        .sort(
          (a, b) =>
            (timestampToMillis(b.lastMessageAt) || timestampToMillis(b.createdAt)) -
            (timestampToMillis(a.lastMessageAt) || timestampToMillis(a.createdAt))
        );

      setConsultations(rooms);
    } catch (error) {
      console.error("상담 목록 조회 실패:", error);
      setConsultationsError(getFriendlyError(error, "상담 목록"));
    } finally {
      setConsultationsLoading(false);
    }
  };

  const handleViewMessages = async (roomId) => {
    const requestId = messageRequestId.current + 1;
    messageRequestId.current = requestId;
    setSelectedRoomId(roomId);
    setMessages([]);
    setMessagesLoading(true);
    setMessagesError("");

    try {
      const loadedMessages = await fetchMessagesForAdmin(roomId);
      loadedMessages.sort(
        (a, b) => timestampToMillis(a.createdAt) - timestampToMillis(b.createdAt)
      );

      if (messageRequestId.current === requestId) setMessages(loadedMessages);
    } catch (error) {
      console.error("채팅 기록 조회 실패:", error);
      if (messageRequestId.current === requestId) {
        setMessagesError(getFriendlyError(error, "채팅 기록"));
      }
    } finally {
      if (messageRequestId.current === requestId) setMessagesLoading(false);
    }
  };

  const closeConsultationModal = () => {
    messageRequestId.current += 1;
    setSelectedCounselor(null);
    setSelectedRoomId(null);
    setConsultations([]);
    setMessages([]);
    setMessagesError("");
  };

  const closeReviewModal = () => {
    setShowReviewModal(false);
    setSelectedCounselor(null);
    setReviews([]);
    setReviewsError("");
  };

  const handleViewReviews = async (counselor) => {
    setSelectedCounselor(counselor);
    setReviews([]);
    setReviewsError("");
    setReviewsLoading(true);
    setShowReviewModal(true);

    try {
      const reviewQuery = query(
        collection(db, "reviews"),
        where("counselorId", "==", counselor.id)
      );
      const snap = await getDocs(reviewQuery);
      const loadedReviews = snap.docs
        .map((reviewDoc) => ({ id: reviewDoc.id, ...reviewDoc.data() }))
        .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
      setReviews(loadedReviews);
    } catch (error) {
      console.error("리뷰 조회 실패:", error);
      setReviewsError(getFriendlyError(error, "리뷰"));
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleDelete = async (uid) => {
    const confirmed = window.confirm("정말 상담사를 삭제하시겠습니까?");
    if (!confirmed) return;

    try {
      await updateDoc(doc(db, "users", uid), {
        role: "user",
        disabled: true,
      });
      setCounselors((previous) => previous.filter((counselor) => counselor.id !== uid));
      alert("상담사가 비활성화되었습니다.");
    } catch (error) {
      console.error(error);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  return (
    <MainLayout title="상담사 관리">
      <div className="admin-mobile-page counselor-admin-page">
        <div className="counselor-admin-heading">
          <div>
            <h2>상담사 현황</h2>
            <p>상담별 전체 대화 기록과 리뷰를 확인할 수 있습니다.</p>
          </div>
          {!counselorsLoading && !counselorsError && (
            <span className="counselor-count">총 {counselors.length}명</span>
          )}
        </div>

        {counselorsLoading && <div className="admin-state-box">상담사 목록을 불러오는 중...</div>}
        {counselorsError && <div className="admin-state-box error">{counselorsError}</div>}
        {!counselorsLoading && !counselorsError && counselors.length === 0 && (
          <div className="admin-state-box">등록된 상담사가 없습니다.</div>
        )}

        <div className="counselor-card-grid">
          {counselors.map((counselor) => (
            <article key={counselor.id} className="counselor-summary-card">
              <div className="counselor-summary-title">
                <div className="counselor-avatar" aria-hidden="true">
                  {(counselor.realName || counselor.nickname || "상").slice(0, 1)}
                </div>
                <div>
                  <h3>{counselor.realName || counselor.nickname || "이름 미등록"}</h3>
                  <p>{counselor.email || "이메일 정보 없음"}</p>
                </div>
              </div>

              <dl className="counselor-stat-grid">
                <div>
                  <dt>평균 별점</dt>
                  <dd>★ {counselor.ratingAvg}</dd>
                </div>
                <div>
                  <dt>리뷰</dt>
                  <dd>{counselor.ratingCount}건</dd>
                </div>
                <div>
                  <dt>전체 상담</dt>
                  <dd>{counselor.totalConsultations}건</dd>
                </div>
                <div>
                  <dt>오늘 상담</dt>
                  <dd>{counselor.todayCount}건</dd>
                </div>
              </dl>

              <div className="admin-action-row counselor-actions">
                <button type="button" onClick={() => handleViewConsultations(counselor)}>
                  상담·채팅 기록
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => handleViewReviews(counselor)}
                >
                  리뷰 보기
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(counselor.id)}
                  className="danger-action"
                >
                  삭제
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {selectedCounselor && !showReviewModal && (
        <div className="admin-modal-overlay" role="presentation" onMouseDown={closeConsultationModal}>
          <section
            className="consultation-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consultation-history-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="history-modal-header">
              <div>
                <span className="history-kicker">상담사 채팅 기록</span>
                <h2 id="consultation-history-title">
                  {selectedCounselor.realName || selectedCounselor.nickname || "상담사"}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-button"
                aria-label="상담 기록 닫기"
                onClick={closeConsultationModal}
              >
                ×
              </button>
            </header>

            <div className="history-workspace">
              <aside className="consultation-list-pane">
                <div className="pane-title-row">
                  <h3>상담 목록</h3>
                  {!consultationsLoading && <span>{consultations.length}건</span>}
                </div>

                {consultationsLoading && <div className="pane-state">불러오는 중...</div>}
                {consultationsError && <div className="pane-state error">{consultationsError}</div>}
                {!consultationsLoading && !consultationsError && consultations.length === 0 && (
                  <div className="pane-state">진행한 상담이 없습니다.</div>
                )}

                <div className="consultation-list" aria-label="상담 목록">
                  {consultations.map((room) => (
                    <button
                      type="button"
                      key={room.id}
                      className={`consultation-list-item ${
                        selectedRoomId === room.id ? "selected" : ""
                      }`}
                      onClick={() => handleViewMessages(room.id)}
                    >
                      <div className="consultation-item-topline">
                        <strong>{room.shortId || room.id.slice(0, 8).toUpperCase()}</strong>
                        <span className={`admin-room-status status-${room.status || "unknown"}`}>
                          {STATUS_LABELS[room.status] || room.status || "상태 없음"}
                        </span>
                      </div>
                      <span className="consultation-category">{room.category || "법률 상담"}</span>
                      <span className="consultation-preview">
                        {room.lastMessage || "메시지가 아직 없습니다."}
                      </span>
                      <time>{formatDateTime(room.lastMessageAt || room.createdAt)}</time>
                    </button>
                  ))}
                </div>
              </aside>

              <main className="message-history-pane">
                {!selectedRoomId && (
                  <div className="message-empty-state">
                    <span aria-hidden="true">💬</span>
                    <strong>상담을 선택해 주세요</strong>
                    <p>왼쪽 목록에서 상담을 누르면 전체 채팅 기록이 표시됩니다.</p>
                  </div>
                )}

                {selectedRoomId && (
                  <>
                    <div className="message-pane-header">
                      <div>
                        <strong>{currentRoom?.category || "법률 상담"}</strong>
                        <span>
                          상담 코드 {currentRoom?.shortId || selectedRoomId.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      {!messagesLoading && !messagesError && (
                        <span className="message-count">메시지 {messages.length}개</span>
                      )}
                    </div>

                    <div className="message-scroll-area" aria-live="polite">
                      {messagesLoading && <div className="message-loading">전체 기록을 불러오는 중...</div>}
                      {messagesError && (
                        <div className="message-error-box">
                          <strong>채팅 기록을 표시하지 못했습니다.</strong>
                          <p>{messagesError}</p>
                          <button type="button" onClick={() => handleViewMessages(selectedRoomId)}>
                            다시 시도
                          </button>
                        </div>
                      )}
                      {!messagesLoading && !messagesError && messages.length === 0 && (
                        <div className="message-empty-state compact">
                          <strong>저장된 채팅 메시지가 없습니다.</strong>
                          <p>상담방은 생성됐지만 아직 주고받은 메시지가 없습니다.</p>
                        </div>
                      )}

                      {!messagesLoading &&
                        !messagesError &&
                        messages.map((message, index) => {
                          const senderId = getMessageSenderId(message);
                          const isCounselor = senderId === currentRoom?.counselorId;
                          const isClient = senderId === currentRoom?.clientId;
                          const senderRole = isCounselor ? "counselor" : isClient ? "client" : "unknown";
                          const previousMessage = messages[index - 1];
                          const previousDay = new Date(
                            timestampToMillis(previousMessage?.createdAt)
                          ).toDateString();
                          const currentDay = new Date(timestampToMillis(message.createdAt)).toDateString();
                          const showDate = index === 0 || previousDay !== currentDay;
                          const attachmentUrls = getAttachmentUrls(message);

                          return (
                            <div key={message.id}>
                              {showDate && (
                                <div className="admin-chat-date">
                                  <span>{formatMessageDate(message.createdAt)}</span>
                                </div>
                              )}
                              <div className={`admin-message-row ${senderRole}`}>
                                <div className="admin-message-wrap">
                                  <span className="admin-message-sender">
                                    {isCounselor ? "상담사" : isClient ? "고객" : "발신자 미확인"}
                                  </span>
                                  <div className="admin-message-bubble">
                                    <p>{getMessageText(message)}</p>
                                    {attachmentUrls.length > 0 && (
                                      <div className="message-attachments">
                                        {attachmentUrls.map((url, attachmentIndex) => (
                                          <a
                                            key={`${url}-${attachmentIndex}`}
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            첨부파일 {attachmentIndex + 1} 열기
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                    <div className="admin-message-meta">
                                      <time>{formatMessageTime(message.createdAt)}</time>
                                      {message.read === true && <span>읽음</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}
              </main>
            </div>
          </section>
        </div>
      )}

      {showReviewModal && (
        <div className="admin-modal-overlay review-overlay" role="presentation" onMouseDown={closeReviewModal}>
          <section
            className="review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="history-modal-header">
              <div>
                <span className="history-kicker">상담사 리뷰</span>
                <h2 id="review-modal-title">
                  {selectedCounselor?.realName || selectedCounselor?.nickname || "상담사"}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-button"
                aria-label="리뷰 닫기"
                onClick={closeReviewModal}
              >
                ×
              </button>
            </header>

            <div className="review-list">
              {reviewsLoading && <div className="pane-state">리뷰를 불러오는 중...</div>}
              {reviewsError && <div className="pane-state error">{reviewsError}</div>}
              {!reviewsLoading && !reviewsError && reviews.length === 0 && (
                <div className="pane-state">작성된 리뷰가 없습니다.</div>
              )}
              {reviews.map((review) => (
                <article key={review.id} className="review-item">
                  <div>
                    <strong>★ {review.rating || 0}</strong>
                    <time>{formatDateTime(review.createdAt)}</time>
                  </div>
                  <p>{review.comment || "내용 없는 리뷰"}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </MainLayout>
  );
}
