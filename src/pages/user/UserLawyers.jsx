import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../config/firebase";
import { isUsableConsultCoupon } from "../../utils/consultCoupons";
import { requestLawyerConsultation, consultationError } from "../../services/lawyerConsultations";
import MainLayout from "../../layouts/MainLayout";
import { formatMatchCount } from "../../utils/lawyerMatchCount";
import "../../styles/userLawyers.css";
import "../../styles/coupons.css";

export default function UserLawyers({ user }) {
  const navigate = useNavigate();
  const [couponCount, setCouponCount] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [existingRooms, setExistingRooms] = useState({});
  const [connecting, setConnecting] = useState("");
  const [matchError, setMatchError] = useState("");
  const [couponRequired, setCouponRequired] = useState(false);
  const couponDialog = useRef(null);
  const lock = useRef(false);
  const [keyword, setKeyword] = useState("");
  const [request, setRequest] = useState({ q: "", page: 1 });
  const [result, setResult] = useState({ request: null, data: null, error: "" });
  const loading = result.request !== request;
  const lawyers = result.data?.lawyers ?? [];
  const pagination = result.data?.pagination;

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setRequest((previous) => ({ ...previous })); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    if (couponRequired) couponDialog.current?.showModal();
  }, [couponRequired]);

  useEffect(() => onSnapshot(collection(db, "app_users", user.uid, "coupons"), (snap) => {
    setCouponCount(snap.docs.filter((entry) => isUsableConsultCoupon(entry.data())).length);
    setCouponError("");
  }, () => { setCouponCount(null); setCouponError("쿠폰을 확인하지 못했습니다. 새로고침해 주세요."); }), [user.uid]);

  useEffect(() => onSnapshot(query(collection(db, "chat_rooms"), where("clientId", "==", user.uid)), (snap) => {
    setExistingRooms(Object.fromEntries(snap.docs.filter((entry) => entry.data().consultType === "lawyer" && entry.data().status === "assigned")
      .map((entry) => [entry.data().directoryId || entry.data().lawyerId, entry.id])));
  }, () => setExistingRooms({})), [user.uid]);

  async function connect(lawyer) {
    if (lock.current) return;
    if (existingRooms[lawyer.id]) { navigate(`/chat/${existingRooms[lawyer.id]}`); return; }
    if (couponCount === 0) { setCouponRequired(true); return; }
    lock.current = true; setConnecting(lawyer.id); setMatchError("");
    try {
      const { data } = await requestLawyerConsultation({ lawyerId: lawyer.id });
      navigate(`/chat/${data.roomId}`);
    } catch (error) {
      const message = consultationError(error);
      setMatchError(message);
      if (error.details?.reason === "COUPON_REQUIRED") setCouponRequired(true);
    }
    finally { lock.current = false; setConnecting(""); }
  }

  useEffect(() => {
    const controller = new AbortController();
    async function loadLawyers() {
      try {
        const params = new URLSearchParams({ q: request.q, page: String(request.page) });
        const response = await fetch(`/api/lawyers?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("변호사 목록에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "변호사 목록을 불러오지 못했습니다.");
        if (!Array.isArray(data.lawyers)) throw new Error("변호사 목록을 불러오지 못했습니다.");
        if (!controller.signal.aborted) setResult({ request, data, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({ request, data: null, error: error.message || "변호사 목록을 불러오지 못했습니다." });
        }
      }
    }
    loadLawyers();
    return () => controller.abort();
  }, [request]);

  return (
    <MainLayout title="변호사 목록">
      <dialog ref={couponDialog} className="coupon-required-dialog" aria-labelledby="coupon-required-title" onClose={() => setCouponRequired(false)}>
        <h2 id="coupon-required-title">상담지원 쿠폰이 필요합니다</h2>
        <p>직접 매칭하려면 상담지원 쿠폰 1장이 필요합니다.<br />상담사에게 쿠폰을 요청해 주세요.</p>
        <form method="dialog"><button className="lawyer-action">확인</button></form>
      </dialog>
      <section className="user-lawyers-page" aria-labelledby="user-lawyers-heading">
        <header className="user-lawyers-heading">
          <div>
            <h2 id="user-lawyers-heading">변호사 찾기</h2>
            <p>상담지원 쿠폰 1장으로 변호사와 직접 매칭하고 채팅하세요.</p>
            <p>{couponCount === null ? "쿠폰 확인 중" : `사용 가능한 쿠폰 ${couponCount}장`}</p>
            <Link to="/chats">기존 변호사 채팅 이어가기</Link>
          </div>
          <button type="button" disabled={loading} onClick={() => setRequest({ ...request })}>
            새로고침
          </button>
        </header>

        {couponError && <p role="alert">{couponError}</p>}
        {matchError && <p role="alert">{matchError}</p>}
        <form className="user-lawyers-search" role="search" onSubmit={(event) => {
          event.preventDefault();
          setRequest({ q: keyword.trim(), page: 1 });
        }}>
          <label htmlFor="lawyer-keyword">이름·지역·사무실 검색</label>
          <div>
            <input
              id="lawyer-keyword"
              type="search"
              maxLength={50}
              value={keyword}
              placeholder="변호사 이름, 지역 또는 사무실명"
              onChange={(event) => setKeyword(event.target.value)}
            />
            <button type="submit" disabled={loading}>검색</button>
          </div>
        </form>

        {loading && <p className="user-lawyers-state" role="status">변호사 목록을 불러오는 중...</p>}
        {!loading && result.error && (
          <div className="user-lawyers-state" role="alert">
            <p>{result.error}</p>
            <button type="button" onClick={() => setRequest({ ...request })}>다시 시도</button>
          </div>
        )}
        {!loading && !result.error && (
          <>
            <p className="user-lawyers-count" role="status">검색 결과 {pagination?.totalCount ?? lawyers.length}명</p>
            {lawyers.length === 0 && <p className="user-lawyers-state">조건에 맞는 변호사가 없습니다.</p>}
            <div className="user-lawyers-grid">
              {lawyers.map((lawyer) => (
                <article className="user-lawyer-card" key={lawyer.id}>
                  {lawyer.photoUrl && <img src={lawyer.photoUrl} alt={`${lawyer.name} 변호사`} loading="lazy" />}
                  <div className="user-lawyer-profile">
                    <span className="user-lawyer-region">{lawyer.region}</span>
                    <h3>{lawyer.name} <small>변호사</small></h3>
                    <p className="user-lawyer-office">{lawyer.office}</p>
                    <p className="user-lawyer-career">{lawyer.careerSummary}</p>
                    <div className="user-lawyer-matches">
                      <span>누적 매칭</span>
                      <strong>{formatMatchCount(lawyer.matchCount)}</strong>
                    </div>
                    <button className="lawyer-action" disabled={Boolean(connecting) || (!existingRooms[lawyer.id] && lawyer.canMatch !== true)} onClick={() => connect(lawyer)}>
                      {connecting === lawyer.id ? "연결 중..." : existingRooms[lawyer.id] ? "채팅 이어가기" : lawyer.canMatch ? "직접 매칭·채팅" : "현재 직접 매칭 불가"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {pagination?.totalPages > 1 && (
              <nav className="user-lawyers-pagination" aria-label="변호사 목록 페이지">
                <button type="button" disabled={pagination.page <= 1} onClick={() =>
                  setRequest({ ...request, page: pagination.page - 1 })
                }>이전</button>
                <span>{pagination.page} / {pagination.totalPages}</span>
                <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() =>
                  setRequest({ ...request, page: pagination.page + 1 })
                }>다음</button>
              </nav>
            )}
          </>
        )}
      </section>
    </MainLayout>
  );
}
