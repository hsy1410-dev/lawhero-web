import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { collection, doc, limit, onSnapshot, orderBy, query, writeBatch } from "firebase/firestore";
import { db } from "../config/firebase";
import { closeLawyerConsultation, sendLawyerChatMessage, consultationError } from "../services/lawyerConsultations";
import "../styles/chat.css";
import "../styles/coupons.css";

export default function LawyerChatRoom(props) {
  const { id } = useParams();
  return <Room key={`${id}:${props.user.uid}`} id={id} {...props} />;
}

function Room({ id, user }) {
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [messageLimit, setMessageLimit] = useState(100);
  const [hasMore, setHasMore] = useState(false);
  const [readError, setReadError] = useState("");
  const pending = useRef(null);
  const lock = useRef(false);
  const bottom = useRef(null);
  const activeRoom = room?.id === id ? room : null;

  useEffect(() => onSnapshot(doc(db, "chat_rooms", id), (snap) => {
    const data = snap.data();
    if (!data || data.consultType !== "lawyer" || ![data.clientId, data.lawyerId].includes(user.uid)) {
      setRoom(null); setError("접근할 수 없는 변호사 상담방입니다."); return;
    }
    setRoom({ ...data, id: snap.id });
  }, () => { setRoom(null); setError("상담방을 불러오지 못했습니다. 권한과 연결 상태를 확인해 주세요."); }), [id, user.uid]);

  useEffect(() => {
    if (!activeRoom) return;
    return onSnapshot(query(collection(db, "chat_rooms", id, "messages"), orderBy("createdAt", "desc"), limit(messageLimit)), (snap) => {
      setMessages(snap.docs.map((entry) => ({ ...entry.data(), id: entry.id })).reverse());
      setHasMore(snap.size === messageLimit);
      const unread = snap.docs.filter((entry) => entry.data().uid !== user.uid && !entry.data().read);
      if (!unread.length && !(activeRoom.unread?.[user.uid] > 0)) return;
      // Keep each write batch below the Firestore limit when older messages are loaded.
      (async () => {
        for (let offset = 0; offset < unread.length; offset += 400) {
          const batch = writeBatch(db);
          unread.slice(offset, offset + 400).forEach((entry) => batch.update(entry.ref, { read: true }));
          await batch.commit();
        }
        const batch = writeBatch(db);
        batch.update(doc(db, "chat_rooms", id), { [`unread.${user.uid}`]: 0 });
        await batch.commit();
        setReadError("");
      })().catch(() => setReadError("읽음 상태를 갱신하지 못했습니다. 메시지는 저장되어 있습니다."));
    }, () => setError("메시지를 불러오지 못했습니다. 새로고침해 주세요."));
  }, [id, user.uid, activeRoom, messageLimit]);

  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [lastMessageId]);

  async function send(event) {
    event?.preventDefault();
    if (lock.current || !text.trim() || activeRoom?.status !== "assigned") return;
    const value = text.trim();
    if (pending.current?.text !== value || pending.current?.roomId !== id) {
      pending.current = { roomId: id, text: value, messageId: crypto.randomUUID() };
    }
    lock.current = true; setBusy(true); setError("");
    try {
      await sendLawyerChatMessage(pending.current);
      pending.current = null; setText("");
    } catch (failure) { setError(consultationError(failure)); }
    finally { lock.current = false; setBusy(false); }
  }

  async function close() {
    if (lock.current || !window.confirm("상담을 종료하시겠습니까? 종료 후 새 매칭에는 쿠폰 1장이 필요합니다.")) return;
    lock.current = true; setBusy(true); setError("");
    try { await closeLawyerConsultation({ roomId: id }); }
    catch (failure) { setError(consultationError(failure)); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="chat-container modern">
    <header className="chat-header modern"><Link to="/chats">← 상담 목록</Link>
      <strong>{activeRoom ? user.uid === activeRoom.lawyerId ? activeRoom.clientName : activeRoom.lawyerName : "변호사 상담"}</strong>
      {activeRoom?.status === "assigned" && <button className="lawyer-action" onClick={close} disabled={busy}>상담 종료</button>}
    </header>
    {error && <p role="alert" style={{ color: "#b42318", padding: "12px 20px" }}>{error}</p>}
    {readError && <p role="status">{readError}</p>}
    {!activeRoom && !error && <p role="status">채팅방을 불러오는 중...</p>}
    <div className="chat-messages modern" role="log" aria-label="상담 메시지">
      {hasMore && <button className="lawyer-action" onClick={() => setMessageLimit((value) => value + 100)}>이전 메시지 더 보기</button>}
      {activeRoom && messages.length === 0 && <p>연결되었습니다. 메시지를 보내 상담을 시작해 주세요.</p>}
      {activeRoom && messages.map((entry) => <div key={entry.id} className={`bubble-row ${entry.uid === user.uid ? "mine" : "other"}`}>
        <div className="chat-bubble modern"><div className="bubble-text">{entry.text}</div>
          <div className="bubble-meta"><span>{entry.createdAt?.toDate?.().toLocaleString("ko-KR") || "전송 중"}</span>
            {entry.uid === user.uid && <span>{entry.read ? "읽음" : "전송됨"}</span>}</div></div>
      </div>)}<div ref={bottom} />
    </div>
    {activeRoom?.status === "assigned" ? <form className="chat-input-bar modern" onSubmit={send}>
      <textarea aria-label="메시지" className="chat-textarea modern" value={text} maxLength={1000} disabled={busy}
        onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) send(event);
        }} placeholder="메시지를 입력하세요 (최대 1,000자)" rows={2} />
      <button className="send-btn modern active" disabled={busy || !text.trim()}>{busy ? "전송 중" : "전송"}</button>
    </form> : activeRoom && <p style={{ padding: 20 }}>종료된 상담입니다. 기록은 계속 확인할 수 있습니다.</p>}
  </div>;
}
