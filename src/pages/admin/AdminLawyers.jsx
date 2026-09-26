import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import LawyerEvidence from "../../components/LawyerEvidence";
import { formatMatchCount, getMatchCount, parseMatchCount } from "../../utils/lawyerMatchCount";
import { MAX_CONTRACT_AMOUNT, parseContractAmount } from "../../utils/lawyerContractAmount";
import "../../styles/adminLawyers.css";

const REGIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];

const EMPTY_FORM = {
  accountUid: "",
  name: "",
  region: "",
  office: "",
  careerSummary: "",
  contractAmount: "",
  matchCount: "0",
  isActive: true,
};

function formatWon(value) {
  return `${new Intl.NumberFormat("ko-KR").format(Number(value) || 0)}원`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("사진 파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

async function getAdminToken() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("관리자 로그인 정보가 없습니다. 다시 로그인해 주세요.");
  return token;
}

async function parseApiResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("관리자 API에 연결하지 못했습니다. 배포 환경을 확인해 주세요.");
  }

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  return payload;
}

function MatchCountEditor({ lawyer, onSaved }) {
  const [value, setValue] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const savingRef = useRef(false);

  const saveCount = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    setMessage("");
    setError("");
    const count = parseMatchCount(value ?? getMatchCount(lawyer.matchCount));
    if (count === null) {
      setError("매칭 횟수는 0 이상의 정수로 입력해 주세요.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const token = await getAdminToken();
      const response = await fetch("/api/adminLawyers", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: lawyer.id, matchCount: count }),
      });
      const payload = await parseApiResponse(response);
      onSaved(lawyer.id, payload.matchCount);
      setValue(null);
      setMessage("저장했습니다. 유저에게 공개됩니다.");
    } catch (saveError) {
      setError(saveError.message || "매칭 횟수를 저장하지 못했습니다.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <form className="lawyer-match-editor" onSubmit={saveCount}>
      <label htmlFor={`match-count-${lawyer.id}`}>누적 매칭 횟수 · 유저 공개</label>
      <div className="lawyer-match-editor-controls">
        <div className="lawyer-money-input">
          <input
            id={`match-count-${lawyer.id}`}
            type="number"
            min="0"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            required
            value={value ?? String(getMatchCount(lawyer.matchCount))}
            disabled={saving}
            onChange={(event) => {
              setValue(event.target.value);
              setMessage("");
              setError("");
            }}
          />
          <b>회</b>
        </div>
        <button type="submit" disabled={saving}>{saving ? "저장 중..." : "횟수 저장"}</button>
      </div>
      <small>수동으로 매칭한 누적 횟수를 입력해 주세요.</small>
      {error && <p className="lawyer-form-message error" role="alert">{error}</p>}
      {message && <p className="lawyer-form-message success" role="status">{message}</p>}
    </form>
  );
}

export default function AdminLawyers({ embedded = false, refreshKey = 0 }) {
  const [lawyers, setLawyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [editingLawyer, setEditingLawyer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchRegion, setSearchRegion] = useState("");
  const [searchOffice, setSearchOffice] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const formSectionRef = useRef(null);
  const loadRequestRef = useRef(0);
  const actionRef = useRef(false);
  const cancelLoads = useCallback(() => { loadRequestRef.current += 1; }, []);

  const loadLawyers = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError("");
    try {
      const token = await getAdminToken();
      const response = await fetch("/api/adminLawyers", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await parseApiResponse(response);
      if (requestId === loadRequestRef.current) setLawyers(Array.isArray(payload.lawyers) ? payload.lawyers : []);
    } catch (error) {
      console.error("변호사 목록 조회 실패:", error);
      if (requestId === loadRequestRef.current) setLoadError(error.message || "변호사 목록을 불러오지 못했습니다.");
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLawyers();
    const refresh = () => { if (document.visibilityState !== "hidden") loadLawyers(); };
    window.addEventListener("focus", refresh);
    return () => { cancelLoads(); window.removeEventListener("focus", refresh); };
  }, [loadLawyers, refreshKey, cancelLoads]);

  useEffect(() => {
    if (!photoFile) return undefined;
    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photoFile]);

  const filteredLawyers = useMemo(() => {
    const normalizedName = searchName.trim().toLocaleLowerCase("ko");
    const normalizedOffice = searchOffice.trim().toLocaleLowerCase("ko");
    return lawyers.filter((lawyer) => {
      const matchesName =
        !normalizedName || lawyer.name.toLocaleLowerCase("ko").includes(normalizedName);
      const matchesRegion = !searchRegion || lawyer.region === searchRegion;
      const matchesOffice =
        !normalizedOffice || lawyer.office.toLocaleLowerCase("ko").includes(normalizedOffice);
      return matchesName && matchesRegion && matchesOffice;
    });
  }, [lawyers, searchName, searchOffice, searchRegion]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setPhotoFile(null);
    setPhotoPreview("");
    setEditingLawyer(null);
    setFormError("");
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setFormError("");
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(editingLawyer?.photoUrl ?? "");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      event.target.value = "";
      setFormError("JPG, PNG, WEBP 형식의 사진만 선택할 수 있습니다.");
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      event.target.value = "";
      setFormError("사진은 2.5MB 이하로 선택해 주세요.");
      return;
    }
    setPhotoFile(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");

    if (!editingLawyer && !photoFile) {
      setFormError("변호사 사진을 선택해 주세요.");
      return;
    }

    const amount = parseContractAmount(form.contractAmount);
    if (amount === null) {
      setFormError("계약금은 0원 이상 1조원 이하의 정수로 입력해 주세요.");
      return;
    }

    const matchCount = parseMatchCount(form.matchCount);
    if (matchCount === null) {
      setFormError("매칭 횟수는 0 이상의 정수로 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      const token = await getAdminToken();
      const imageDataUrl = photoFile ? await readFileAsDataUrl(photoFile) : "";
      const response = await fetch("/api/adminLawyers", {
        method: editingLawyer ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(editingLawyer ? { id: editingLawyer.id } : {}),
          ...form,
          contractAmount: amount,
          matchCount,
          ...(imageDataUrl ? { imageDataUrl } : {}),
        }),
      });
      const payload = await parseApiResponse(response);
      resetForm();
      setSuccessMessage(payload.message || "변호사 정보를 저장했습니다.");
      await loadLawyers();
    } catch (error) {
      console.error("변호사 저장 실패:", error);
      setFormError(error.message || "변호사 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (lawyer) => {
    setEditingLawyer(lawyer);
    setForm({
      accountUid: lawyer.accountUid || "",
      name: lawyer.name,
      region: lawyer.region,
      office: lawyer.office,
      careerSummary: lawyer.careerSummary,
      contractAmount: String(lawyer.contractAmount ?? 0),
      matchCount: String(getMatchCount(lawyer.matchCount)),
      isActive: lawyer.isActive !== false,
    });
    setPhotoFile(null);
    setPhotoPreview(lawyer.photoUrl || "");
    setFormError("");
    setSuccessMessage("");
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleVisibility = async (lawyer) => {
    if (actionRef.current) return;
    actionRef.current = true;
    setUpdatingId(lawyer.id);
    setLoadError("");
    try {
      const token = await getAdminToken();
      const response = await fetch("/api/adminLawyers", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: lawyer.id, isActive: !lawyer.isActive }),
      });
      await parseApiResponse(response);
      setLawyers((previous) =>
        previous.map((item) =>
          item.id === lawyer.id ? { ...item, isActive: !lawyer.isActive } : item
        )
      );
    } catch (error) {
      console.error("변호사 노출 상태 변경 실패:", error);
      setLoadError(error.message || "노출 상태를 변경하지 못했습니다.");
    } finally {
      actionRef.current = false;
      setUpdatingId("");
    }
  };

  const deleteLawyer = async (lawyer) => {
    if (actionRef.current || !window.confirm(`${lawyer.name} 변호사의 프로필을 삭제하시겠습니까? 앱·웹 검색과 관리 목록에서 사라지며, 기존 상담 기록과 회원 계정은 유지됩니다.`)) return;
    actionRef.current = true;
    setUpdatingId(lawyer.id);
    setLoadError("");
    try {
      const token = await getAdminToken();
      const response = await fetch("/api/adminLawyers", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: lawyer.id }),
      });
      await parseApiResponse(response);
      ++loadRequestRef.current;
      setLoading(false);
      setLawyers((previous) => previous.filter((item) => item.id !== lawyer.id));
      if (editingLawyer?.id === lawyer.id) resetForm();
      setSuccessMessage("변호사 프로필을 삭제했습니다.");
    } catch (error) {
      setLoadError(error.message || "변호사 프로필을 삭제하지 못했습니다.");
    } finally {
      actionRef.current = false;
      setUpdatingId("");
    }
  };

  const handleMatchCountSaved = (id, matchCount) => {
    setLawyers((previous) => previous.map((lawyer) =>
      lawyer.id === id ? { ...lawyer, matchCount } : lawyer
    ));
    if (editingLawyer?.id === id) {
      setForm((previous) => ({ ...previous, matchCount: String(matchCount) }));
    }
  };

  const content = (
      <div className="lawyer-admin-page">
        <section className="lawyer-form-section" ref={formSectionRef}>
          <header className="lawyer-section-heading">
            <div>
              <span className="lawyer-heading-kicker">LAWYER PROFILE</span>
              <h2>{editingLawyer ? "변호사 정보 수정" : "새 변호사 등록"}</h2>
              <p>고객에게 보여줄 프로필·매칭 횟수와 내부 계약정보를 등록합니다.</p>
            </div>
            {editingLawyer && (
              <button type="button" className="lawyer-cancel-button" onClick={resetForm}>
                수정 취소
              </button>
            )}
          </header>

          <form className="lawyer-form" onSubmit={handleSubmit}>
            <label>채팅할 변호사 회원 UID
              <input value={form.accountUid} maxLength={128} onChange={(event) => setForm((previous) => ({ ...previous, accountUid: event.target.value }))}
                placeholder="승인된 변호사 회원의 UID" />
              <small>전문가·변호사 회원 목록의 UID를 연결하면 직접 매칭과 채팅이 가능합니다.</small>
            </label>
            <div className="lawyer-photo-field">
              <div className={`lawyer-photo-preview ${photoPreview ? "has-photo" : ""}`}>
                {photoPreview ? (
                  <img src={photoPreview} alt="등록할 변호사 미리보기" />
                ) : (
                  <div>
                    <span aria-hidden="true">+</span>
                    <strong>프로필 사진</strong>
                    <small>정면 인물 사진 권장</small>
                  </div>
                )}
              </div>
              <label className="lawyer-file-button">
                사진 선택
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                />
              </label>
              <small>JPG · PNG · WEBP / 최대 2.5MB</small>
            </div>

            <div className="lawyer-form-fields">
              <div className="lawyer-field-grid">
                <label>
                  <span>변호사 이름</span>
                  <input
                    value={form.name}
                    maxLength={50}
                    placeholder="예: 김로이"
                    required
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </label>

                <label>
                  <span>지역</span>
                  <select
                    value={form.region}
                    required
                    onChange={(event) => setForm({ ...form, region: event.target.value })}
                  >
                    <option value="">지역 선택</option>
                    {REGIONS.map((region) => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                </label>

                <label className="lawyer-office-field">
                  <span>소속 사무실</span>
                  <input
                    value={form.office}
                    maxLength={100}
                    placeholder="예: 법무법인 로히어로"
                    required
                    onChange={(event) => setForm({ ...form, office: event.target.value })}
                  />
                </label>

                <label className="lawyer-contract-field">
                  <span>계약금</span>
                  <div className="lawyer-money-input">
                    <input
                      type="number"
                      min="0"
                      max={MAX_CONTRACT_AMOUNT}
                      step="1"
                      value={form.contractAmount}
                      placeholder="0"
                      required
                      onChange={(event) =>
                        setForm({ ...form, contractAmount: event.target.value })
                      }
                    />
                    <b>원</b>
                  </div>
                  <small>관리자 전용 · 금액이 높은 순으로 검색 상단에 배치됩니다.</small>
                </label>
                <label className="lawyer-match-field">
                  <span>누적 매칭 횟수</span>
                  <div className="lawyer-money-input">
                    <input
                      type="number"
                      min="0"
                      max={Number.MAX_SAFE_INTEGER}
                      step="1"
                      required
                      value={form.matchCount}
                      onChange={(event) => setForm({ ...form, matchCount: event.target.value })}
                    />
                    <b>회</b>
                  </div>
                  <small>수동으로 매칭한 누적 횟수입니다. 유저에게 공개됩니다.</small>
                </label>
              </div>

              <label className="lawyer-career-field">
                <span>간단 경력</span>
                <textarea
                  value={form.careerSummary}
                  rows={5}
                  maxLength={500}
                  placeholder={"예: 대한변호사협회 등록 형사법 전문변호사\n前 서울중앙지방법원 국선변호인"}
                  required
                  onChange={(event) =>
                    setForm({ ...form, careerSummary: event.target.value })
                  }
                />
                <small>{form.careerSummary.length}/500자</small>
              </label>

              <label className="lawyer-visibility-check">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                />
                <span>
                  <strong>고객 검색에 노출</strong>
                  <small>끄면 정보는 보관되지만 고객 검색 결과에서는 제외됩니다.</small>
                </span>
              </label>

              {formError && <div className="lawyer-form-message error" role="alert">{formError}</div>}
              {successMessage && (
                <div className="lawyer-form-message success" role="status">{successMessage}</div>
              )}

              <button type="submit" className="lawyer-submit-button" disabled={saving}>
                {saving
                  ? "저장 중..."
                  : editingLawyer
                    ? "변호사 정보 저장"
                    : "변호사 등록하기"}
              </button>
            </div>
          </form>
        </section>

        <section className="lawyer-list-section">
          <header className="lawyer-section-heading lawyer-list-heading">
            <div>
              <span className="lawyer-heading-kicker">CONTRACTED LAWYERS</span>
              <h2>등록 변호사</h2>
              <p>계약금이 높은 순서로 표시됩니다. 계약금은 이 관리자 화면에서만 보입니다.</p>
            </div>
            {!loading && !loadError && <strong className="lawyer-total-count">총 {lawyers.length}명</strong>}
            <button type="button" onClick={loadLawyers} disabled={loading || Boolean(updatingId)}>새로고침</button>
          </header>

          <div className="lawyer-search-bar" role="search">
            <label>
              <span>이름 검색</span>
              <input
                type="search"
                value={searchName}
                placeholder="변호사 이름"
                onChange={(event) => setSearchName(event.target.value)}
              />
            </label>
            <label>
              <span>지역 검색</span>
              <select value={searchRegion} onChange={(event) => setSearchRegion(event.target.value)}>
                <option value="">전체 지역</option>
                {REGIONS.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </label>
            <label>
              <span>사무실 검색</span>
              <input
                type="search"
                value={searchOffice}
                placeholder="법무법인·사무실명"
                onChange={(event) => setSearchOffice(event.target.value)}
              />
            </label>
            <span className="lawyer-search-result">검색 결과 {filteredLawyers.length}명</span>
          </div>

          {loading && <div className="lawyer-state-box">변호사 목록을 불러오는 중...</div>}
          {loadError && <div className="lawyer-state-box error" role="alert">{loadError}</div>}
          {!loading && !loadError && filteredLawyers.length === 0 && (
            <div className="lawyer-state-box">조건에 맞는 변호사가 없습니다.</div>
          )}

          <div className="lawyer-card-grid">
            {filteredLawyers.map((lawyer, index) => (
              <article key={lawyer.id} className={`lawyer-card ${lawyer.isActive ? "" : "inactive"}`}>
                <div className="lawyer-rank-badge">#{index + 1}</div>
                <div className="lawyer-card-photo">
                  {lawyer.photoUrl ? <img src={lawyer.photoUrl} alt={`${lawyer.name} 변호사`} /> : <div className="lawyer-photo-placeholder" aria-label="사진 미등록">⚖</div>}
                  <span className={lawyer.isActive ? "active" : "hidden"}>
                    {lawyer.isActive ? "노출 중" : "노출 중지"}
                  </span>
                </div>
                <div className="lawyer-card-body">
                  <div className="lawyer-card-title">
                    <div>
                      <h3>{lawyer.name} <small>변호사</small></h3>
                      <p>{lawyer.office}</p>
                    </div>
                    <span className="lawyer-region-badge">{lawyer.region}</span>
                  </div>
                  <p className="lawyer-card-career">{lawyer.careerSummary}</p>
                  {lawyer.accountUid && <LawyerEvidence key={lawyer.accountUid} uid={lawyer.accountUid} />}
                  <p className="lawyer-match-summary">누적 매칭 <strong>{formatMatchCount(lawyer.matchCount)}</strong></p>
                  <MatchCountEditor
                    lawyer={lawyer}
                    onSaved={handleMatchCountSaved}
                  />
                  <div className="lawyer-contract-box">
                    <span><b aria-hidden="true">🔒</b> 내부 계약금</span>
                    <strong>{formatWon(lawyer.contractAmount)}</strong>
                  </div>
                  <div className="lawyer-card-actions">
                    <button type="button" className="lawyer-edit-button" disabled={saving || Boolean(updatingId)} onClick={() => startEditing(lawyer)}>
                      정보 수정
                    </button>
                    <button
                      type="button"
                      className="lawyer-visibility-button"
                      disabled={saving || Boolean(updatingId)}
                      onClick={() => toggleVisibility(lawyer)}
                    >
                      {updatingId === lawyer.id
                        ? "처리 중..."
                        : lawyer.isActive
                          ? "노출 중지"
                          : "다시 노출"}
                    </button>
                    <button type="button" className="lawyer-delete-button" disabled={saving || Boolean(updatingId)} onClick={() => deleteLawyer(lawyer)}>
                      프로필 삭제
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
  );
  return embedded ? content : <MainLayout title="변호사 관리">{content}</MainLayout>;
}
