import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  increment,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import "../../styles/chat.css";
import { getConsultationText } from "../../utils/consultation";
import { sendPush } from "../../utils/sendPush";

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;

  const seconds = value.seconds ?? value._seconds;
  if (typeof seconds === "number") return seconds * 1000;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
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
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function getMessageCreatedAt(message) {
  return (
    message.createdAt ??
    message.sentAt ??
    message.timestamp ??
    message.updatedAt ??
    null
  );
}

export default function ChatRoom() {
  const { id } = useParams();
  const nav = useNavigate();
  const myUid = auth.currentUser?.uid;

  const [messages, setMessages] = useState([]);
  const [consultationMessage, setConsultationMessage] = useState(null);
  const [room, setRoom] = useState(null);
  const [text, setText] = useState("");

  const bottomRef = useRef(null);

  /* ================= ROOM ================= */
  useEffect(() => {
    if (!id) return;

    return onSnapshot(doc(db, "chat_rooms", id), (snap) => {
      if (!snap.exists()) {
        nav(-1);
        return;
      }

      const roomData = { id: snap.id, ...snap.data() };

      if (
        myUid !== roomData.clientId &&
        myUid !== roomData.counselorId
      ) {
        alert("접근 권한이 없습니다.");
        nav(-1);
        return;
      }

      setRoom(roomData);
    });
  }, [id, myUid, nav]);

  /* ================= MESSAGES ================= */
  useEffect(() => {
    if (!id || !myUid || !room) return;

    return onSnapshot(collection(db, "chat_rooms", id, "messages"), async (snap) => {
      const list = snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: getMessageCreatedAt(d.data()),
        }))
        .sort(
          (a, b) =>
            timestampToMillis(a.createdAt) - timestampToMillis(b.createdAt)
        );

      setMessages(list);

      /* 읽음 처리 */
      const unreadMessages = snap.docs.filter((docSnap) => {
        const msg = docSnap.data();
        return !msg.read && getMessageSenderId(msg) !== myUid;
      });

      if (unreadMessages.length > 0) {
        await Promise.all(
          unreadMessages.map((docSnap) =>
            updateDoc(docSnap.ref, { read: true })
          )
        );

        await updateDoc(doc(db, "chat_rooms", id), {
          [`unread.${myUid}`]: 0,
        });
      }

      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    });
  }, [id, myUid, room]);

  /* 기존에 이미 분리된 방도 최소한 신청 당시 상담 내용은 복원해서 보여준다. */
  useEffect(() => {
    let active = true;

    if (!room?.requestId) {
      return () => {
        active = false;
      };
    }

    getDoc(doc(db, "consult_requests", room.requestId))
      .then((snapshot) => {
        if (!active || !snapshot.exists()) return;

        const request = snapshot.data();
        const requestText = getConsultationText(request);
        setConsultationMessage(
          requestText
            ? {
                id: "consultation-request-fallback",
                requestId: room.requestId,
                uid: room.clientId,
                text: requestText,
                createdAt: request.createdAt ?? room.createdAt ?? null,
                read: true,
                source: "consultation_request_fallback",
              }
            : null
        );
      })
      .catch((error) => {
        if (active) {
          console.warn("상담 신청 내용 불러오기 실패:", error);
          setConsultationMessage(null);
        }
      });

    return () => {
      active = false;
    };
  }, [room?.clientId, room?.createdAt, room?.requestId]);

  const visibleMessages = useMemo(() => {
    if (
      !consultationMessage ||
      consultationMessage.requestId !== room?.requestId
    ) {
      return messages;
    }

    const fallbackText = getMessageText(consultationMessage).trim();
    const alreadyIncluded = messages.some(
      (message) =>
        message.source === "consultation_request" ||
        (getMessageSenderId(message) === consultationMessage.uid &&
          getMessageText(message).trim() === fallbackText)
    );

    if (alreadyIncluded) return messages;

    return [...messages, consultationMessage].sort(
      (a, b) =>
        timestampToMillis(a.createdAt) - timestampToMillis(b.createdAt)
    );
  }, [consultationMessage, messages, room?.requestId]);

  /* ================= SEND MESSAGE ================= */
  const sendMessage = async () => {
    if (!text.trim() || !myUid || !room) return;

    const messageText = text.trim();
    setText("");

    const roomRef = doc(db, "chat_rooms", id);

    const otherUid =
      myUid === room.clientId
        ? room.counselorId
        : room.clientId;

    if (!otherUid || typeof otherUid !== "string") {
      console.error("❌ 잘못된 otherUid:", otherUid);
      return;
    }

    try {
      /* 🔥 메시지 저장 */
      await addDoc(collection(db, "chat_rooms", id, "messages"), {
        uid: myUid,
        text: messageText,
        createdAt: serverTimestamp(),
        read: false,
      });

      /* 🔥 채팅방 업데이트 */
      await updateDoc(roomRef, {
        lastMessage: messageText,
        lastMessageAt: serverTimestamp(),
        lastSender: myUid,
        [`unread.${otherUid}`]: increment(1),
      });

      /* 🔥 푸시 알림 */
      await sendPush({
        type: "chat",
        targetUid: otherUid,
        consultId: id,
        message: messageText,
      });

    } catch (err) {
      console.error("sendMessage error:", err);
    }
  };

  /* ================= ENTER SEND ================= */
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ================= DATE ================= */
  const isNewDay = (current, prev) => {
    const currentMillis = timestampToMillis(current);
    const previousMillis = timestampToMillis(prev);
    if (!currentMillis) return false;
    if (!previousMillis) return true;

    const c = new Date(currentMillis);
    const p = new Date(previousMillis);

    return c.toDateString() !== p.toDateString();
  };

  const formatDate = (ts) => {
    const millis = timestampToMillis(ts);
    if (!millis) return "";
    return new Date(millis).toLocaleDateString();
  };

  const formatTime = (ts) => {
    const millis = timestampToMillis(ts);
    if (!millis) return "";
    return new Date(millis).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!room)
    return <div className="chat-loading">채팅방 로딩 중...</div>;

  return (
    <div className="chat-container modern">

      {/* HEADER */}
      <div className="chat-header modern">
        <div className="header-left">
          <div className="avatar">🧑‍⚖️</div>
          <div>
            <div className="chat-title">
              {room.category ?? "법률 상담"}
            </div>
            <div className={`status ${room.status}`}>
              {room.status === "waiting" && "대기 중"}
              {room.status === "assigned" && "연결됨"}
              {room.status === "closed" && "종료됨"}
            </div>
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="chat-messages modern">
        {visibleMessages.map((msg, index) => {
          const mine = getMessageSenderId(msg) === myUid;
          const prev = visibleMessages[index - 1];
          const showDate = isNewDay(msg.createdAt, prev?.createdAt);

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="date-divider modern">
                  {formatDate(msg.createdAt)}
                </div>
              )}

              <div className={`bubble-row ${mine ? "mine" : "other"}`}>
                <div className="chat-bubble modern">
                  <div className="bubble-text">{getMessageText(msg)}</div>

                  <div className="bubble-meta">
                    <span className="bubble-time">
                      {formatTime(msg.createdAt)}
                    </span>

                    {mine && (
                      <span className="read-status">
                        {msg.read ? "읽음" : "전송됨"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* INPUT */}
      <div className="chat-input-bar modern">
        <textarea
          className="chat-textarea modern"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요"
          rows={1}
        />

        <button
          className={`send-btn modern ${
            text.trim() ? "active" : ""
          }`}
          onClick={sendMessage}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
