import { useEffect, useState } from "react";
import MainLayout from "../../layouts/MainLayout";
import { formatMatchCount } from "../../utils/lawyerMatchCount";
import "../../styles/userLawyers.css";

export default function UserLawyers() {
  const [keyword, setKeyword] = useState("");
  const [request, setRequest] = useState({ q: "", page: 1 });
  const [result, setResult] = useState({ request: null, data: null, error: "" });
  const loading = result.request !== request;
  const lawyers = result.data?.lawyers ?? [];
  const pagination = result.data?.pagination;

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
      <section className="user-lawyers-page" aria-labelledby="user-lawyers-heading">
        <header className="user-lawyers-heading">
          <div>
            <h2 id="user-lawyers-heading">변호사 찾기</h2>
            <p>변호사의 경력과 누적 매칭 횟수를 확인해 보세요.</p>
          </div>
          <button type="button" disabled={loading} onClick={() => setRequest({ ...request })}>
            새로고침
          </button>
        </header>

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
            <button type="submit">검색</button>
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
