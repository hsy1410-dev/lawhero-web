import { useEffect, useState, useCallback } from "react";
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
  const [loading, setLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState({});
  const [hasNextPage, setHasNextPage] = useState(false);

  /* ===============================
     탭 변경 시 초기화
  =============================== */
  useEffect(() => {
    setSubFilter("all");
    setCurrentPage(1);
    setPageCursors({});
  }, [mainTab]);

  /* ===============================
     필터 변경 시 페이지 초기화
  =============================== */
  useEffect(() => {
    setCurrentPage(1);
    setPageCursors({});
  }, [subFilter]);

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

    /* 전문가 / 정보 탭 -> field 기준 */
    if (mainTab === "expert" || mainTab === "info") {
      if (subFilter !== "all") {
        q = query(q, where("field", "==", subFilter));
      }
      q = query(q, orderBy("createdAt", "desc"));
    }

    /* 경험 탭 */
    else if (mainTab === "experience") {
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
     특정 페이지 조회
  =============================== */
  const fetchPage = useCallback(
    async (page) => {
      try {
        setLoading(true);

        let q = buildBaseQuery();

        if (page > 1) {
          const prevCursor = pageCursors[page - 1];
          if (!prevCursor) {
            setLoading(false);
            return;
          }
          q = query(q, startAfter(prevCursor), limit(PAGE_SIZE + 1));
        } else {
          q = query(q, limit(PAGE_SIZE + 1));
        }

        const snap = await getDocs(q);
        const docs = snap.docs;

        const visibleDocs = docs.slice(0, PAGE_SIZE);
        const nextExists = docs.length > PAGE_SIZE;

        setPosts(
          visibleDocs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );

        setHasNextPage(nextExists);

        if (visibleDocs.length > 0) {
          setPageCursors((prev) => ({
            ...prev,
            [page]: visibleDocs[visibleDocs.length - 1],
          }));
        }
      } catch (error) {
        console.error("커뮤니티 글 조회 실패:", error);
        setPosts([]);
        setHasNextPage(false);
      } finally {
        setLoading(false);
      }
    },
    [buildBaseQuery, pageCursors]
  );

  /* ===============================
     현재 페이지 로드
  =============================== */
  useEffect(() => {
    fetchPage(currentPage);
  }, [currentPage, fetchPage]);

  /* ===============================
     페이지 이동
  =============================== */
  const handlePageClick = async (page) => {
    if (page < 1) return;

    if (page > 1 && !pageCursors[page - 1]) {
      for (let p = 1; p < page; p++) {
        if (!pageCursors[p]) {
          await fetchPage(p);
        }
      }
    }

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

        {/* 글 목록 */}
        <div className="community-list">
          {loading ? (
            <p className="empty">불러오는 중...</p>
          ) : posts.length === 0 ? (
            <p className="empty">게시글이 없습니다.</p>
          ) : (
            posts.map((post) => (
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

                {/* 태그 */}
                {mainTab === "expert" || mainTab === "info" ? (
                  <div className="tags">
                    <span className="tag-main">{post.field}</span>
                  </div>
                ) : (
                  post.subCategory && (
                    <div className="tag">{post.subCategory}</div>
                  )
                )}

                {/* 좋아요 + 댓글 */}
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
            ))
          )}
        </div>

        {/* 페이지네이션 */}
        {!loading && posts.length > 0 && (
          <div className="pagination">
            <button
              className="page-btn"
              disabled={currentPage === 1}
              onClick={() => handlePageClick(currentPage - 1)}
            >
              이전
            </button>

            {visiblePageNumbers.map((pageNum) => (
              <button
                key={pageNum}
                className={`page-btn ${currentPage === pageNum ? "active" : ""}`}
                onClick={() => handlePageClick(pageNum)}
              >
                {pageNum}
              </button>
            ))}

            <button
              className="page-btn"
              disabled={!hasNextPage}
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
