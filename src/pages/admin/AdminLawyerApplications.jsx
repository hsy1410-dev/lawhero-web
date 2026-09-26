import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MainLayout from "../../layouts/MainLayout";
import LawyerEvidence from "../../components/LawyerEvidence";
import { applicationError, fetchLawyerApplications, reviewLawyerApplication, saveLawyerContract } from "../../services/lawyerApplications";
import { MAX_CONTRACT_AMOUNT, parseContractAmount } from "../../utils/lawyerContractAmount";
import "../../styles/adminLawyerApplications.css";

const STATUSES = { pending: "승인 대기", approved: "승인 완료", rejected: "반려", draft: "작성 중" };
const METHODS = { registration_certificate: "변호사 등록 증명원", lawyer_id: "변호사 신분증 사본", bar_id: "대한변협 신분증 번호" };
const DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
function date(value) {
  return value && Number.isFinite(new Date(value).getTime()) ? DATE_FORMAT.format(new Date(value)) : "—";
}

function Status({ value }) {
  return <span className={`application-status status-${Object.hasOwn(STATUSES, value) ? value : "draft"}`}>{STATUSES[value] || "상태 확인 필요"}</span>;
}

function Fields({ rows }) {
  return <dl className="application-fields">{rows.map(([label, value]) => (
    <div key={label}><dt>{label}</dt><dd>{value === null || value === undefined || value === "" ? "—" : value}</dd></div>
  ))}</dl>;
}

function ContractEditor({ application, onSaved }) {
  const [value, setValue] = useState(application.contractAmount === null ? "" : String(application.contractAmount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    if (busy.current) return;
    const amount = parseContractAmount(value);
    if (amount === null) {
      setError("계약금은 0원 이상 1조원 이하의 정수로 입력해 주세요.");
      return;
    }
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await saveLawyerContract(application.uid, amount);
      if (alive.current) onSaved(`${application.name}님의 계약금 ${amount.toLocaleString("ko-KR")}원을 저장했습니다. 고객 목록은 계약금이 높은 순으로 표시됩니다.`);
    } catch (failure) {
      if (alive.current) setError(applicationError(failure));
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  };

  return <section className="application-section">
    <h3>계약금 관리</h3>
    <p className="application-note">계약금을 저장하면 고객 목록에 등록되며, 금액이 높은 순으로 표시됩니다. 계약금은 관리자에게만 표시됩니다.</p>
    {application.profileDeleted && <p className="application-warning">삭제된 프로필입니다. 계약금을 저장해도 고객 검색에 다시 표시되지 않습니다.</p>}
    {application.profileExists && !application.profileDeleted && !application.profileActive && <p className="application-warning">현재 고객 목록 노출이 중지되어 있습니다. 계약금 저장 후에도 노출 상태는 유지됩니다.</p>}
    <form className="application-contract-form" onSubmit={save}>
      <label htmlFor="application-contract-amount">계약금 (원)</label>
      <div className="application-contract-controls">
        <input id="application-contract-amount" type="number" min="0" max={MAX_CONTRACT_AMOUNT} step="1" required
          inputMode="numeric" value={value} disabled={saving} placeholder="계약금을 입력해 주세요"
          onChange={(event) => { setValue(event.target.value); setError(""); }} />
        <button type="submit" disabled={saving}>{saving ? "저장 중…" : "계약금 저장"}</button>
      </div>
      {error && <p className="application-error" role="alert">{error}</p>}
    </form>
    <p className="application-note">사진·지역·경력과 노출 상태는 <Link to="/admin/lawyers">변호사 프로필 관리</Link>에서 수정할 수 있습니다.</p>
  </section>;
}

function ApplicationDetail({ uid, onReviewed, onRetry }) {
  const [state, setState] = useState({ loading: true, application: null, error: "" });
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState("");
  const [reviewError, setReviewError] = useState("");
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    fetchLawyerApplications({ uid }, controller.signal).then(({ application }) => {
      if (!controller.signal.aborted) setState({ loading: false, application, error: "" });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ loading: false, application: null, error: applicationError(error) });
    });
    return () => { alive.current = false; controller.abort(); };
  }, [uid]);

  const review = async (decision) => {
    if (busy.current) return;
    if (decision === "reject" && !reason.trim()) {
      setReviewError("반려 사유를 입력해 주세요. 신청자에게 표시됩니다.");
      return;
    }
    if (decision === "approve" && (!checked || !state.application.canApprove)) return;
    busy.current = true;
    setSaving(decision);
    setReviewError("");
    try {
      await reviewLawyerApplication(uid, decision, reason);
      onReviewed(`${state.application.name || "신청자"}님의 신청을 ${decision === "approve" ? "승인" : "반려"}했습니다.`);
    } catch (error) {
      if (alive.current) setReviewError(applicationError(error));
    } finally {
      busy.current = false;
      if (alive.current) setSaving("");
    }
  };

  if (state.loading) return <section className="application-detail" aria-busy="true"><p role="status">가입 신청서를 불러오는 중입니다…</p></section>;
  if (state.error) return <section className="application-detail"><p className="application-error" role="alert">{state.error}</p><button onClick={onRetry}>다시 시도</button></section>;
  const a = state.application;
  const e = a.evidence;
  return (
    <section className="application-detail" aria-label="신청 상세 정보">
      <header className="application-detail-heading">
        <div><p className="application-eyebrow">변호사 가입 신청서</p><h2>{a.name || "이름 미등록"}</h2><p className="application-note">{a.email || "이메일 미등록"}</p></div>
        <Status value={a.status} />
      </header>
      <section className="application-section">
        <h3>가입 정보</h3>
        <Fields rows={[
          ["아이디", a.username], ["회원 UID", a.uid], ["이름", a.name], ["휴대폰번호", a.phone],
          ["생년월일", a.birthDate], ["성별", { male: "남성", female: "여성" }[a.gender]],
          ["출신시험 / 회차", a.examType ? `${a.examType} · ${a.examRound ?? "—"}회` : null], ["소속 사무소 / 회사", a.office],
          ["방문경로", a.referralSource], ["추천 변호사", a.referringLawyer],
          ["가입 신청일", date(a.createdAt)], ["인증 제출일", date(a.submittedAt)],
          ["이용약관 / 개인정보 동의", `${a.termsAccepted ? "동의" : "미동의"} / ${a.privacyAccepted ? "동의" : "미동의"}`],
          ["약관 동의일", date(a.agreedAt)], ["약관 버전", a.termsVersion],
        ]} />
      </section>
      <section className="application-section">
        <h3>휴대폰 본인인증 (선택)</h3>
        <p className="application-note">휴대폰 본인인증은 승인 필수 조건이 아닙니다. 가입 정보와 변호사 인증 자료를 확인해 주세요.</p>
        <p className={a.identity.matches ? "application-success" : "application-note"}>
          {a.identity.matches ? "본인인증 완료 · 신청서의 이름과 휴대폰번호가 일치합니다." : a.identity.verified ? "본인인증 정보와 신청서가 일치하지 않습니다." : "본인인증이 완료되지 않았습니다."}
        </p>
        <Fields rows={[["인증된 이름", a.identity.name], ["인증된 휴대폰번호", a.identity.phone], ["본인인증 일시", date(a.identity.verifiedAt)]]} />
      </section>
      <section className="application-section">
        <h3>변호사 인증 자료</h3>
        {e ? <>
          <Fields rows={[
            ["인증 방식", METHODS[e.method] || e.method],
            ...(e.method === "registration_certificate" ? [
              ["증빙 성명", e.name], ["자격 상태", e.qualificationStatus], ["증빙 사무소", e.office], ["사무소 소재지", e.officeAddress], ["발급일", e.issuedDate],
            ] : [["등록번호", e.registrationNumber], ["발급번호", e.issueNumber], ...(e.method === "lawyer_id" ? [["증빙 성명", e.name], ["증빙 생년월일", e.birthDate]] : [])]),
          ]} />
          <LawyerEvidence key={uid} uid={uid} evidence={e} />
        </> : <p className="application-note">아직 변호사 인증 자료를 제출하지 않았습니다.</p>}
      </section>
      {(a.reviewedAt || a.rejectionReason) && <section className="application-section">
        <h3>최근 심사 결과</h3>
        <Fields rows={[["심사일", date(a.reviewedAt)], ["처리 관리자", a.reviewedBy], ["반려 사유", a.rejectionReason]]} />
      </section>}
      {a.canEditContract && <ContractEditor application={a} onSaved={onReviewed} />}
      <section className="application-section application-review">
        <h3>신청 심사</h3>
        {a.status === "pending" ? <>
          <p className="application-note">승인하면 앱과 웹의 변호사 회원 권한 및 인증 배지가 함께 반영됩니다. 승인 완료 후 이 화면에서 계약금을 입력할 수 있습니다.</p>
          {!a.canApprove && <p className="application-warning">변호사 인증 자료의 제출 상태와 가입 정보 일치 여부를 확인해 주세요. 승인 조건이 충족되지 않았습니다.</p>}
          <label className="application-check"><input type="checkbox" checked={checked} disabled={Boolean(saving) || !a.canApprove} onChange={(event) => setChecked(event.target.checked)} />가입 정보와 변호사 인증 자료를 확인했습니다.</label>
          <button type="button" disabled={Boolean(saving) || !checked || !a.canApprove} onClick={() => review("approve")}>{saving === "approve" ? "승인 중…" : "변호사 회원 승인"}</button>
          <label className="application-reason" htmlFor="application-reason">반려 사유 <span>반려 시 필수 · 신청자에게 표시</span></label>
          <textarea id="application-reason" rows={3} maxLength={500} value={reason} disabled={Boolean(saving)} onChange={(event) => setReason(event.target.value)} placeholder="수정하거나 다시 제출할 내용을 구체적으로 입력해 주세요." />
          <div className="application-reject-row"><small>{reason.length}/500자</small><button type="button" className="application-danger" disabled={Boolean(saving)} onClick={() => review("reject")}>{saving === "reject" ? "반려 중…" : "사유와 함께 반려"}</button></div>
          {reviewError && <p className="application-error" role="alert">{reviewError}</p>}
        </> : <p className="application-note">{a.status === "draft" ? "가입자가 인증 자료를 제출하면 승인 또는 반려할 수 있습니다." : a.status === "rejected" ? "반려된 신청입니다. 가입자가 수정 후 다시 제출하면 심사할 수 있습니다." : "이미 심사가 완료된 신청입니다."}</p>}
      </section>
    </section>
  );
}

export default function AdminLawyerApplications() {
  const [state, setState] = useState({ loading: true, applications: [], error: "" });
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchLawyerApplications({}, controller.signal).then(({ applications }) => {
      if (!controller.signal.aborted) setState({ loading: false, applications, error: "" });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ loading: false, applications: [], error: applicationError(error) });
    });
    return () => controller.abort();
  }, [version]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("ko");
    return state.applications.filter((a) => (status === "all" || a.status === status) &&
      [a.name, a.username, a.email, a.phone, a.office, a.uid].some((value) => String(value ?? "").toLocaleLowerCase("ko").includes(keyword)));
  }, [state.applications, status, search]);

  const refresh = () => {
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    setVersion((previous) => previous + 1);
  };

  return (
    <MainLayout title="변호사 회원 승인">
      <div className="lawyer-applications-page">
        <header className="applications-heading">
          <div><p className="application-eyebrow">회원 심사</p><h1>변호사 회원 승인</h1><p>가입 정보와 인증 자료를 확인하고 변호사 회원 신청을 심사하세요.</p></div>
          <div className="applications-heading-actions"><Link to="/admin/lawyers">변호사 프로필 관리 ↗</Link><button type="button" className="application-secondary" disabled={state.loading} onClick={refresh}>새로고침</button></div>
        </header>
        {message && <p className="application-success" role="status">{message}</p>}
        <div className="applications-toolbar">
          <div className="applications-filters" aria-label="신청 상태 필터">
            {[["all", "전체"], ...Object.entries(STATUSES)].map(([key, label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)}>
              {label} <b>{state.applications.filter((a) => key === "all" || a.status === key).length}</b>
            </button>)}
          </div>
          <label className="applications-search">회원 검색<input type="search" placeholder="이름, 아이디, 이메일, 전화번호, 소속" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        </div>
        <div className="applications-workspace">
          <section className="applications-list" aria-label="변호사 신청 목록" aria-busy={state.loading}>
            <h2>{STATUSES[status] || "전체 신청"} <span>{filtered.length}명</span></h2>
            {state.loading ? <p className="application-empty" role="status">신청 목록을 불러오는 중입니다…</p> : state.error ? <div className="application-empty"><p className="application-error" role="alert">{state.error}</p><button onClick={refresh}>다시 시도</button></div> : !filtered.length ? <p className="application-empty">{search ? "검색 조건에 맞는 신청자가 없습니다." : "해당 상태의 가입 신청이 없습니다."}</p> : <ul>
              {filtered.map((a) => <li key={a.uid}><button type="button" className="application-list-item" aria-pressed={selectedUid === a.uid} onClick={() => setSelectedUid(a.uid)}>
                <div><strong>{a.name || "신청서 확인 필요"}</strong><Status value={a.status} /></div>
                <p>{a.office || "소속 미등록"}</p><p>{a.email || a.username || a.uid}</p><small>{a.submittedAt ? "제출" : "가입"} {date(a.submittedAt || a.createdAt)}</small>
              </button></li>)}
            </ul>}
          </section>
          {selectedUid ? <ApplicationDetail key={`${selectedUid}:${version}`} uid={selectedUid} onRetry={refresh} onReviewed={(text) => { setMessage(text); refresh(); }} /> : <section className="application-detail application-unselected"><span aria-hidden="true">⚖</span><h2>신청자를 선택해 주세요</h2><p>가입 정보, 본인인증 결과와<br />제출한 증빙을 확인할 수 있습니다.</p></section>}
        </div>
      </div>
    </MainLayout>
  );
}
