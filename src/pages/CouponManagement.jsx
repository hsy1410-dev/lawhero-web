import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import MainLayout from "../layouts/MainLayout";
import { allocateCounselorCoupons, issueCounselorCoupons, getCounselorCouponSummary, consultationError } from "../services/lawyerConsultations";
import "../styles/coupons.css";

export default function CouponManagement({ user, role }) {
  const admin = role === "admin";
  const [params] = useSearchParams();
  const [counselors, setCounselors] = useState([]);
  const [selected, setSelected] = useState(params.get("counselor") || "");
  const counselorUid = admin ? selected : user.uid;
  const [summary, setSummary] = useState(null);
  const [revision, setRevision] = useState(0);
  const [quantity, setQuantity] = useState("1");
  const [search, setSearch] = useState(params.get("recipient") || "");
  const [recipients, setRecipients] = useState([]);
  const [recipient, setRecipient] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const pending = useRef(null);
  const lock = useRef(false);
  const loading = Boolean(counselorUid) && summary?.uid !== counselorUid;

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    getDocs(query(collection(db, "users"), where("role", "==", "counselor")))
      .then((snap) => { if (alive) setCounselors(snap.docs.map((entry) => ({ ...entry.data(), id: entry.id }))); })
      .catch(() => { if (alive) setError("상담사 목록을 불러오지 못했습니다."); });
    return () => { alive = false; };
  }, [admin]);

  useEffect(() => {
    if (!counselorUid) return;
    let alive = true;
    getCounselorCouponSummary({ counselorUid }).then(({ data }) => {
      if (alive) setSummary({ ...data, uid: counselorUid });
    }).catch((failure) => { if (alive) setError(consultationError(failure)); });
    return () => { alive = false; };
  }, [counselorUid, revision]);

  async function searchRecipients(event) {
    event.preventDefault();
    const term = search.trim();
    if (!term || searching) return;
    setSearching(true); setError(""); setRecipient(null); setRecipients([]);
    try {
      const [byId, byNickname] = await Promise.all([
        /^[\w-]{1,128}$/.test(term) ? getDoc(doc(db, "app_users", term)) : null,
        getDocs(query(collection(db, "app_users"), where("nickname", "==", term), limit(20))),
      ]);
      const entries = [...(byId?.exists() ? [byId] : []), ...byNickname.docs];
      const results = [...new Map(entries.map((entry) => [entry.id, { ...entry.data(), id: entry.id }])).values()]
        .filter((entry) => (entry.role || "user") === "user");
      setRecipients(results);
      if (!results.length) setError("일치하는 앱 유저가 없습니다. 닉네임 또는 UID를 확인해 주세요.");
    } catch { setError("유저를 검색하지 못했습니다. 다시 시도해 주세요."); }
    finally { setSearching(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    const count = Number(quantity);
    const maximum = admin ? 1000 : 20;
    if (!Number.isSafeInteger(count) || count < 1 || count > maximum) {
      setError(`수량은 1~${maximum} 사이의 정수로 입력해 주세요.`); return;
    }
    if (!counselorUid || (!admin && !recipient)) { setError("지급 대상을 선택해 주세요."); return; }
    const data = admin ? { counselorUid, quantity: count } : { recipientUid: recipient.id, quantity: count };
    const key = JSON.stringify(data);
    if (pending.current?.key !== key) pending.current = { key, operationId: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await (admin ? allocateCounselorCoupons : issueCounselorCoupons)({ ...data, operationId: pending.current.operationId });
      pending.current = null;
      setMessage(`${admin ? "상담사에게" : `${recipient.nickname || recipient.name || recipient.id}님에게`} 쿠폰 ${count}장을 지급했습니다.`);
      setRevision((value) => value + 1);
    } catch (failure) { setError(consultationError(failure)); }
    finally { lock.current = false; setBusy(false); }
  }

  const data = summary?.uid === counselorUid ? summary : null;
  return <MainLayout title={admin ? "상담사 쿠폰 관리" : "쿠폰 지급 및 사용 현황"}>
    <div className="coupon-page">
      <header className="coupon-heading"><div><h2>{admin ? "상담사에게 쿠폰 지급" : "앱 유저에게 쿠폰 지급"}</h2>
        <p>상담지원 쿠폰 1장으로 변호사와 직접 매칭할 수 있습니다.</p></div>
        <button disabled={!counselorUid || busy} onClick={() => { setError(""); setRevision((value) => value + 1); }}>현황 새로고침</button></header>
      {admin && <label className="coupon-field">상담사 선택<select value={selected} disabled={busy} onChange={(event) => {
        setSelected(event.target.value); setError(""); setMessage("");
      }}><option value="">상담사를 선택하세요</option>{counselors.map((entry) => <option key={entry.id} value={entry.id}>
        {entry.name || entry.realName || entry.email || entry.id} · {entry.email || entry.id}
      </option>)}</select></label>}
      {error && <p className="coupon-error" role="alert">{error}</p>}
      {message && <p className="coupon-success" role="status">{message}</p>}
      {loading && !error && <p role="status">쿠폰 현황을 불러오는 중...</p>}
      {data && <div className="coupon-stats">{[["누적 받은 쿠폰", data.allocated], ["지급 가능한 잔여", data.remaining],
        ["유저에게 지급", data.issued], ["유저가 매칭에 사용", data.used], ["관리자 회수", data.reclaimed]].map(([label, count]) =>
        <div key={label}><span>{label}</span><strong>{count ?? 0}<small>장</small></strong></div>)}</div>}
      {!admin && <section className="coupon-panel"><h3>지급 대상 찾기</h3>
        <form onSubmit={searchRecipients} className="coupon-search"><label className="coupon-field">앱 유저 닉네임 또는 UID
          <input value={search} onChange={(event) => setSearch(event.target.value)} required disabled={busy} /></label>
          <button disabled={busy || searching}>{searching ? "검색 중..." : "검색"}</button></form>
        <div className="coupon-recipients">{recipients.map((entry) => <label key={entry.id}>
          <input type="radio" name="recipient" checked={recipient?.id === entry.id} disabled={busy} onChange={() => setRecipient(entry)} />
          <span>{entry.nickname || entry.name || "이름 없음"}<small>UID: {entry.id}</small></span>
        </label>)}</div>
      </section>}
      <form className="coupon-panel coupon-issue" onSubmit={submit}>
        <label className="coupon-field">지급 수량<input aria-label="지급 수량" type="number" min="1" max={admin ? 1000 : 20} step="1"
          value={quantity} onChange={(event) => setQuantity(event.target.value)} required disabled={busy} /></label>
        <button disabled={busy || !data || (!admin && (!recipient || data.remaining < Number(quantity)))}>
          {busy ? "지급 중..." : admin ? "상담사에게 지급" : "선택한 유저에게 지급"}</button>
        {!admin && <p>내 잔여 쿠폰에서 지급됩니다. 한 번에 최대 20장까지 지급할 수 있습니다.</p>}
      </form>
      {data && <section className="coupon-panel"><h3>유저 지급 내역</h3><p>지급한 쿠폰의 실제 매칭 사용 여부입니다. 최근 100건을 표시합니다.</p>
        {!data.history?.length ? <p>아직 지급한 내역이 없습니다.</p> : <div className="coupon-table-wrap"><table><thead><tr>
          <th>지급일</th><th>앱 유저</th><th>지급</th><th>매칭 사용</th><th>사용 가능</th><th>만료·회수·삭제</th>
        </tr></thead><tbody>{data.history.map((entry) => <tr key={entry.id}>
          <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString("ko-KR") : "-"}</td>
          <td>{entry.recipientName}<small>{entry.recipientUid}</small></td><td>{entry.quantity}장</td><td>{entry.used}장</td>
          <td>{entry.available}장</td><td>{entry.unavailable}장</td>
        </tr>)}</tbody></table></div>}
      </section>}
      {admin && <Link to="/admin/users?role=counselor">유저 관리로 돌아가기</Link>}
    </div>
  </MainLayout>;
}
