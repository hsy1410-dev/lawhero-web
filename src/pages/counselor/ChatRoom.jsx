import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  increment,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import "../../styles/chat.css";
import { sendPush } from "../../utils/sendPush";

export default function ChatRoom() {
  const { id } = useParams();
  const nav = useNavigate();
  const myUid = auth.currentUser?.uid;

  const [messages, setMessages] = useState([]);
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

    const q = query(
      collection(db, "chat_rooms", id, "messages"),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(q, async (snap) => {
      const list = snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        .filter((m) => m.createdAt);

      setMessages(list);

      /* 읽음 처리 */
      const unreadMessages = snap.docs.filter((docSnap) => {
        const msg = docSnap.data();
        return msg.createdAt && !msg.read && msg.uid !== myUid;
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
    if (!current || !current.toDate) return false;
    if (!prev || !prev.toDate) return true;

    const c = current.toDate();
    const p = prev.toDate();

    return c.toDateString() !== p.toDateString();
  };

  const formatDate = (ts) => {
    if (!ts || !ts.toDate) return "";
    return ts.toDate().toLocaleDateString();
  };

  const formatTime = (ts) => {
    if (!ts || !ts.toDate) return "";
    return ts.toDate().toLocaleTimeString([], {
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
        {messages.map((msg, index) => {
          const mine = msg.uid === myUid;
          const prev = messages[index - 1];
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
                  <div className="bubble-text">{msg.text}</div>

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