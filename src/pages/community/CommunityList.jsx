import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  limit,
  startAfter,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import { useNavigate } from "react-router-dom";
import "../../styles/community.css";

/* ===============================
   1차 탭
=============================== */
const MAIN_TABS = [
  { key: "experience", label: "경험" },
  { key: "expert", label: "전문가" },
  { key: "info", label: "정보" },
];

/* ===============================
   경험 탭 2차 필터
=============================== */
const EXPERIENCE_FILTERS = [
  { key: "all", label: "전체" },
  { key: "popular", label: "인기" },
  { key: "고민/후기", label: "고민/후기" },
  { key: "실제상담", label: "실제상담" },
];

/* ===============================
   전문가 / 정보 분야
=============================== */
const FIELD_FILTERS = [
  "이혼",
  "형사",
  "민사",
  "도산/개인회생",
  "부동산",
  "전체 분야",
];

const PAGE_SIZE = 20;

export default function CommunityList() {
  const nav = useNavigate();

  const [mainTab, setMainTab] = useState("experience");
  const [subFilter, setSubFilter] = useState("all");

  const [posts, setPosts] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  // 페이지별 마지막 문서 캐시
  const pageCursorsRef = useRef({});
  // 요청 순서 꼬임 방지
  const requestIdRef = useRef(0);

  /* ===============================
     현재 필터 조합 key
  =============================== */
  const queryKey = useMemo(() => {
    return `${mainTab}__${subFilter}`;
  }, [mainTab, subFilter]);

  /* ===============================
     날짜 포맷
  =============================== */
  const formatDate = (createdAt) => {
    try {
      return createdAt?.toDate?.().toLocaleString?.() || "";
    } catch {
      return "";
    }
  };

  /* ===============================
     Firestore Query 생성
  =============================== */
  const buildBaseQuery = useCallback(() => {
    const base = collection(db, "community_posts");
    let q = query(base, where("category", "==", mainTab));

    if (mainTab === "expert" || mainTab === "info") {
      if (subFilter !== "all") {
        q = query(q, where("field", "==", subFilter));
      }
      q = query(q, orderBy("createdAt", "desc"));
    } else if (mainTab === "experience") {
      if (subFilter === "popular") {
        q = query(
          q,
          where("likeCount", ">=", 10),
          orderBy("likeCount", "desc")
        );
      } else {
        if (subFilter !== "all") {
          q = query(q, where("subCategory", "==", subFilter));
        }
        q = query(q, orderBy("createdAt", "desc"));
      }
    }

    return q;
  }, [mainTab, subFilter]);

  /* ===============================
     특정 페이지 docs 조회
     - 화면 상태 변경 없음
  =============================== */
  const getPageDocs = useCallback(
    async (page) => {
      let q = buildBaseQuery();

      if (page > 1) {
        const prevCursor = pageCursorsRef.current[page - 1];
        if (!prevCursor) return null;
        q = query(q, startAfter(prevCursor), limit(PAGE_SIZE + 1));
      } else {
        q = query(q, limit(PAGE_SIZE + 1));
      }

      const snap = await getDocs(q);
      return snap.docs;
    },
    [buildBaseQuery]
  );

  /* ===============================
     page 이전 커서 확보
     - 화면 상태 변경 없음
  =============================== */
  const ensureCursorUntil = useCallback(
    async (page) => {
      if (page <= 1) return true;

      for (let p = 1; p < page; p++) {
        if (!pageCursorsRef.current[p]) {
          const docs = await getPageDocs(p);
          if (!docs) return false;

          const visibleDocs = docs.slice(0, PAGE_SIZE);
          if (visibleDocs.length === 0) return false;

          pageCursorsRef.current[p] = visibleDocs[visibleDocs.length - 1];
        }
      }

      return true;
    },
    [getPageDocs]
  );

  /* ===============================
     실제 페이지 로드
     - 기존 posts 유지
     - 준비 끝난 뒤 한 번만 setPosts
  =============================== */
  const fetchPage = useCallback(
    async (page, options = {}) => {
      const { isFilterChange = false } = options;
      const requestId = ++requestIdRef.current;

      if (isFilterChange && posts.length === 0) {
        setInitialLoading(true);
      } else {
        setPageLoading(true);
      }

      try {
        const ok = await ensureCursorUntil(page);
        if (!ok) {
          if (requestId !== requestIdRef.current) return;

          setPosts([]);
          setHasNextPage(false);
          return;
        }

        const docs = await getPageDocs(page);
        if (requestId !== requestIdRef.current) return;

        if (!docs) {
          setPosts([]);
          setHasNextPage(false);
          return;
        }

        const visibleDocs = docs.slice(0, PAGE_SIZE);
        const nextExists = docs.length > PAGE_SIZE;

        if (visibleDocs.length > 0) {
          pageCursorsRef.current[page] = visibleDocs[visibleDocs.length - 1];
        }

        // 여기서만 화면 교체
        setPosts(
          visibleDocs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
        setHasNextPage(nextExists);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        console.error("커뮤니티 글 조회 실패:", error);
      } finally {
        if (requestId === requestIdRef.current) {
          setInitialLoading(false);
          setPageLoading(false);
        }
      }
    },
    [ensureCursorUntil, getPageDocs, posts.length]
  );

  /* ===============================
     탭/필터 바뀌면 커서 초기화 후 1페이지 로드
     - 기존 화면은 유지한 채 새 데이터 준비
  =============================== */
  useEffect(() => {
    pageCursorsRef.current = {};
    setCurrentPage(1);
    setHasNextPage(false);

    fetchPage(1, { isFilterChange: true });
  }, [queryKey, fetchPage]);

  /* ===============================
     페이지 변경
     - 첫 페이지 초기 로드는 위 effect가 담당
  =============================== */
  useEffect(() => {
    if (currentPage === 1) return;
    fetchPage(currentPage);
  }, [currentPage, fetchPage]);

  /* ===============================
     페이지 이동
  =============================== */
  const handlePageClick = (page) => {
    if (page < 1) return;
    if (page === currentPage) return;
    setCurrentPage(page);
  };

  /* ===============================
     표시할 페이지 번호 계산
  =============================== */
  const visiblePageNumbers = [];
  for (let i = 1; i <= currentPage; i++) {
    visiblePageNumbers.push(i);
  }
  if (hasNextPage) {
    visiblePageNumbers.push(currentPage + 1);
  }

  const showEmpty = !initialLoading && posts.length === 0;
  const showOverlayLoading = pageLoading && posts.length > 0;

  return (
    <MainLayout title="커뮤니티">
      <div className="community-page">
        {/* 상단 헤더 */}
        <div className="community-header">
          <div className="main-tabs">
            {MAIN_TABS.map((t) => (
              <button
                key={t.key}
                className={mainTab === t.key ? "active" : ""}
                onClick={() => setMainTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            className="write-floating-btn"
            onClick={() => nav("/community/write")}
          >
            글쓰기
          </button>
        </div>

        {/* 경험 탭 2차 필터 */}
        {mainTab === "experience" && (
          <div className="sub-filters">
            {EXPERIENCE_FILTERS.map((f) => (
              <button
                key={f.key}
                className={subFilter === f.key ? "active" : ""}
                onClick={() => setSubFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* 전문가 / 정보 분야 Grid */}
        {(mainTab === "expert" || mainTab === "info") && (
          <div className="expert-grid">
            {FIELD_FILTERS.map((field) => (
              <div
                key={field}
                className={`expert-card ${subFilter === field ? "active" : ""}`}
                onClick={() => {
                  if (field === "전체 분야") {
                    setSubFilter("all");
                  } else {
                    setSubFilter(field);
                  }
                }}
              >
                {field}
              </div>
            ))}
          </div>
        )}

        {/* 탭별 타이틀 */}
        {mainTab === "expert" && <h2 className="case-title">상담 사례</h2>}
        {mainTab === "info" && <h2 className="case-title">법률 정보</h2>}

        {/* 리스트 래퍼 */}
        <div className="community-list-wrap">
          {/* 첫 진입에만 비어있는 로딩 */}
          {initialLoading && posts.length === 0 ? (
            <p className="empty">불러오는 중...</p>
          ) : showEmpty ? (
            <p className="empty">게시글이 없습니다.</p>
          ) : (
            <>
              {showOverlayLoading && (
                <div className="community-list-overlay">
                  <div className="community-list-overlay-text">불러오는 중...</div>
                </div>
              )}

              <div className="community-list">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className={`community-card ${
                      mainTab === "expert" || mainTab === "info" ? "expert" : ""
                    }`}
                    onClick={() => nav(`/community/${post.id}`)}
                  >
                    <div className="meta-top">
                      <span className="nickname">{post.nickname || "유저명"}</span>
                      <span className="date">{formatDate(post.createdAt)}</span>
                    </div>

                    <h3>{post.title}</h3>
                    <p className="preview">{post.content}</p>

                    {mainTab === "expert" || mainTab === "info" ? (
                      <div className="tags">
                        <span className="tag-main">{post.field}</span>
                      </div>
                    ) : (
                      post.subCategory && <div className="tag">{post.subCategory}</div>
                    )}

                    <div className="meta-bottom">
                      <span>
                        <img src="/heart.png" alt="" />
                        {post.likeCount || 0}
                      </span>
                      <span>
                        <img src="/comment.png" alt="" />
                        {post.commentCount || 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 페이지네이션 */}
        {!showEmpty && posts.length > 0 && (
          <div className="pagination">
            <button
              className="page-btn"
              disabled={currentPage === 1 || pageLoading}
              onClick={() => handlePageClick(currentPage - 1)}
            >
              이전
            </button>

            {visiblePageNumbers.map((pageNum) => (
              <button
                key={pageNum}
                className={`page-btn ${currentPage === pageNum ? "active" : ""}`}
                disabled={pageLoading}
                onClick={() => handlePageClick(pageNum)}
              >
                {pageNum}
              </button>
            ))}

            <button
              className="page-btn"
              disabled={!hasNextPage || pageLoading}
              onClick={() => handlePageClick(currentPage + 1)}
            >
              다음
            </button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
