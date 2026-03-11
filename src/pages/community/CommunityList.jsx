import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
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
   2차 필터 (experience, info만 사용)
=============================== */
const SUB_FILTERS = {
  experience: [
    { key: "all", label: "전체" },
    { key: "popular", label: "인기" },
    { key: "고민/후기", label: "고민/후기" },
    { key: "실제상담", label: "실제상담" },
  ],
  info: [
    { key: "all", label: "전체" },
    { key: "popular", label: "인기" },
    { key: "사례모음", label: "사례모음" },
    { key: "절차가이드", label: "절차가이드" },
    { key: "법률정보", label: "법률정보" },
  ],
};

/* ===============================
   전문가 분야
=============================== */
const EXPERT_FIELDS = [
  "형사",
  "민사",
  "도산/개인회생",
  "이혼",
  "부동산",
  "전체 분야",
];

export default function CommunityList() {
  const nav = useNavigate();

  const [mainTab, setMainTab] = useState("experience");
  const [subFilter, setSubFilter] = useState("all");
  const [posts, setPosts] = useState([]);

  /* 탭 변경 시 필터 초기화 */
  useEffect(() => {
    setSubFilter("all");
  }, [mainTab]);

  /* 🔥 게시글 실시간 구독 */
  useEffect(() => {
    const base = collection(db, "community_posts");

    let q = query(base, where("category", "==", mainTab));

    /* ===============================
       전문가 필터 (field 기준)
    =============================== */
    if (mainTab === "expert") {
      if (subFilter !== "all") {
        q = query(q, where("field", "==", subFilter));
      }
      q = query(q, orderBy("createdAt", "desc"));
    }

    /* ===============================
       경험 / 정보 필터
    =============================== */
    else {
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

    q = query(q, limit(50));

    const unsub = onSnapshot(q, (snap) => {
      setPosts(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });

    return () => unsub();
  }, [mainTab, subFilter]);

  return (
    <MainLayout title="커뮤니티">
  <div className="community-page">

    {/* 상단 헤더 영역 */}
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

      {/* 🔥 글쓰기 버튼 */}
      <button
        className="write-floating-btn"
        onClick={() => nav("/community/write")}
      >
        글쓰기
      </button>
    </div>
      </div>

      {/* 2차 필터 (experience, info만) */}
      {mainTab !== "expert" && (
        <div className="sub-filters">
          {SUB_FILTERS[mainTab].map((f) => (
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

      {/* 전문가 분야 Grid */}
      {mainTab === "expert" && (
        <div className="expert-grid">
          {EXPERT_FIELDS.map((field) => (
            <div
              key={field}
              className={`expert-card ${
                subFilter === field ? "active" : ""
              }`}
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

      {/* 상담 사례 헤더 (전문가 전용) */}
      {mainTab === "expert" && (
        <h2 className="case-title">상담 사례</h2>
      )}

      {/* 글 목록 */}
      <div className="community-list">
        {posts.map((post) => (
          <div
            key={post.id}
            className={`community-card ${
              mainTab === "expert" ? "expert" : ""
            }`}
            onClick={() => nav(`/community/${post.id}`)}
          >
            <div className="meta-top">
              <span className="nickname">
                {post.nickname || "유저명"}
              </span>
              <span className="date">
                {post.createdAt?.toDate?.().toLocaleString?.() || ""}
              </span>
            </div>

            <h3>{post.title}</h3>

            <p className="preview">{post.content}</p>

            {/* 태그 */}
            {mainTab === "expert" ? (
              <div className="tags">
                <span className="tag-main">
                  {post.field}
                </span>
              </div>
            ) : (
              post.subCategory && (
                <div className="tag">
                  {post.subCategory}
                </div>
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
        ))}

        {posts.length === 0 && (
          <p className="empty">게시글이 없습니다.</p>
        )}
      </div>
    </MainLayout>
  );
}