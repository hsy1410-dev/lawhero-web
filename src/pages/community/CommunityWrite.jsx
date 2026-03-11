import { useEffect, useState } from "react";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import "../../styles/community.css";

/* ==============================
   경험 세부
============================== */
const EXPERIENCE_TYPES = ["고민", "후기", "상담 후기", "일상"];

/* ==============================
   전문가 & 정보 공통 분야
============================== */
const FIELDS = [
  "형사",
  "민사",
  "도산/개인회생",
  "이혼",
  "부동산",
];

/* ==============================
   레벨 계산
============================== */
function calculateLevel(postCount = 0, commentCount = 0) {
  if (postCount >= 500 && commentCount >= 1000) return 5;
  if (postCount >= 300 && commentCount >= 500) return 4;
  if (postCount >= 100 && commentCount >= 100) return 3;
  if (postCount >= 30 && commentCount >= 30) return 2;
  if (postCount >= 1 && commentCount >= 1) return 1;
  return 0;
}

export default function CommunityWrite() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const storage = getStorage();
const [imageFile, setImageFile] = useState(null);
  const [mainCategory, setMainCategory] = useState("experience");
  const [selectedType, setSelectedType] = useState("고민");
  const [selectedField, setSelectedField] = useState("형사");
  const [infoSubField, setInfoSubField] = useState("");
const [imageUrl, setImageUrl] = useState(null);
const [generating, setGenerating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);

  /* ==============================
     유저 정보 불러오기
  ============================== */
  useEffect(() => {
    if (!user) return;

    const loadUser = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setRole(data.role || "");
        setNickname(data.nickname || "로비");
      }
    };

    loadUser();
  }, [user]);

  if (!user) {
    return (
      <MainLayout title="글쓰기">
        <div className="empty-box">
          <p>로그인 후 글을 작성할 수 있습니다.</p>
        </div>
      </MainLayout>
    );
  }
const generateAIIcon = async () => {
  if (!infoSubField.trim()) {
    alert("세부 분야를 먼저 입력해주세요.");
    return;
  }

  setGenerating(true);

  try {
    const res = await fetch("/api/generate-icon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field: selectedField,
        subField: infoSubField,
      }),
    });

    if (!res.ok) {
      throw new Error("API 실패");
    }

    const data = await res.json();
    setImageUrl(data.imageUrl);

  } catch (e) {
    console.error(e);
    alert("아이콘 생성 실패");
  } finally {
    setGenerating(false);
  }
};
  /* ==============================
     글 등록
  ============================== */
  const handleSubmit = async () => {
  if (saving) return;

  if (!title.trim() || !content.trim()) {
    alert("제목과 내용을 입력해주세요.");
    return;
  }

  if (mainCategory === "info" && !infoSubField.trim()) {
    alert("정보 세부분야를 입력해주세요.");
    return;
  }

  setSaving(true);

  try {
   

    /* ==============================
       🔥 정보 카테고리 이미지 업로드
    ============================== */
    if (mainCategory === "info" && imageFile) {
      if (imageFile.type !== "image/png") {
        alert("PNG 파일만 업로드 가능합니다.");
        setSaving(false);
        return;
      }

      const imageRef = ref(
        storage,
        `community_icons/${user.uid}_${Date.now()}.png`
      );

      await uploadBytes(imageRef, imageFile);
      imageUrl = await getDownloadURL(imageRef);
    }

    /* ==============================
       게시글 데이터 생성
    ============================== */
    const postData = {
      category: mainCategory,
      uid: user.uid,
      role,
      title: title.trim(),
      content: content.trim(),
      nickname: nickname?.trim() ? nickname : "유저",
      authorId: user.uid,
      createdAt: serverTimestamp(),
      likeCount: 0,
      commentCount: 0,
      viewCount: 0,
    };

    /* 경험 */
    if (mainCategory === "experience") {
      postData.subCategory = selectedType;
    }

    /* 전문가 */
    if (mainCategory === "expert") {
      postData.field = selectedField;
    }

    /* 정보 */
    if (mainCategory === "info") {
      postData.field = selectedField;
      postData.subField = infoSubField.trim();
      postData.imageUrl = imageUrl || null; // 🔥 이미지 URL 저장
    }

    /* ==============================
       게시글 저장
    ============================== */
    const refDoc = await addDoc(
      collection(db, "community_posts"),
      postData
    );

    /* postCount 증가 */
    await setDoc(
      doc(db, "app_users", user.uid),
      { postCount: increment(1) },
      { merge: true }
    );

    /* ==============================
       레벨 재계산
    ============================== */
    const userSnap = await getDoc(
      doc(db, "app_users", user.uid)
    );
    const userData = userSnap.data();

    const newLevel = calculateLevel(
      userData.postCount || 0,
      userData.commentCount || 0
    );

    if ((userData.profileLevel || 0) < newLevel) {
      await setDoc(
        doc(db, "app_users", user.uid),
        { profileLevel: newLevel },
        { merge: true }
      );
    }

    nav(`/community/${refDoc.id}`);

  } catch (e) {
    console.error(e);
    alert("오류가 발생했습니다.");
  } finally {
    setSaving(false);
  }
};

  return (
    <MainLayout title="글쓰기">
      <div className="write-container">

        {/* ==============================
           1차 카테고리 선택
        ============================== */}
        <label>글 유형</label>
        <select
          value={mainCategory}
          onChange={(e) => setMainCategory(e.target.value)}
          className="write-select"
        >
          <option value="experience">경험</option>
          <option value="expert">전문가</option>
          <option value="info">정보</option>
        </select>

        {/* ==============================
           경험 세부
        ============================== */}
        {mainCategory === "experience" && (
          <>
            <label>카테고리</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="write-select"
            >
              {EXPERIENCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </>
        )}

        {/* ==============================
           전문가 분야
        ============================== */}
        {mainCategory === "expert" && (
          <>
            <label>전문 분야</label>
            <select
              value={selectedField}
              onChange={(e) => setSelectedField(e.target.value)}
              className="write-select"
            >
              {FIELDS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </>
        )}

        {/* ==============================
           정보 분야
        ============================== */}
        {mainCategory === "info" && (
          <>
            <label>정보 분야</label>
            <select
              value={selectedField}
              onChange={(e) => setSelectedField(e.target.value)}
              className="write-select"
            >
              {FIELDS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>

            <label>세부 분야 (직접 입력)</label>
            <input
              type="text"
              placeholder="예: 보석 신청 절차, 합의 방법 등"
              className="write-input"
              value={infoSubField}
              onChange={(e) => setInfoSubField(e.target.value)}
            />
            <label>AI 아이콘 생성</label>

{/* 아직 생성 안했을 때 */}
{!imageUrl && (
  <button
    type="button"
    onClick={generateAIIcon}
    disabled={generating}
    className="write-btn"
  >
    {generating ? "생성 중..." : "아이콘 생성하기"}
  </button>
)}

{/* 생성 후 */}
{imageUrl && (
  <div style={{ marginTop: 10 }}>
    <img
      src={imageUrl}
      alt="AI icon"
      style={{
        width: 120,
        height: 120,
        borderRadius: 12,
        display: "block",
        marginBottom: 10,
      }}
    />

    <button
      type="button"
      onClick={generateAIIcon}
      disabled={generating}
      className="write-btn"
      style={{ backgroundColor: "#6B7280" }}
    >
      {generating ? "다시 생성 중..." : "🔄 다시 생성"}
    </button>
  </div>
)}
          </>
        )}

        {/* ==============================
           제목
        ============================== */}
        <input
          type="text"
          placeholder="제목을 입력하세요"
          className="write-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* ==============================
           내용
        ============================== */}
        <textarea
          placeholder="내용을 입력하세요."
          className="write-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        {/* ==============================
           등록 버튼
        ============================== */}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="write-btn"
        >
          {saving ? "등록 중..." : "등록하기"}
        </button>

      </div>
    </MainLayout>
  );
}