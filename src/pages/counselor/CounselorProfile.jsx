// src/pages/counselor/CounselorProfile.jsx

import { useEffect, useState } from "react";
import { auth, db } from "../../config/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import MainLayout from "../../layouts/MainLayout";

const SPECIALTY_OPTIONS = [
  "형사",
  "민사",
  "도산/개인회생",
  "이혼",
  "부동산"
];

export default function CounselorProfile() {
  const [loading, setLoading] = useState(true);
  const [realName, setRealName] = useState("");
  const [specialties, setSpecialties] = useState([]); // 🔥 배열로 변경
  const [saving, setSaving] = useState(false);

  /* ===============================
     🔥 프로필 불러오기
  =============================== */
  useEffect(() => {
    async function loadProfile() {
      const user = auth.currentUser;
      if (!user) return;

      const snap = await getDoc(doc(db, "users", user.uid));

      if (snap.exists()) {
        const data = snap.data();

        if (data.role !== "counselor") {
          alert("상담사만 접근 가능합니다.");
          return;
        }

        setRealName(data.realName || "");
        setSpecialties(data.specialties || []);
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

  /* ===============================
     🔥 체크박스 토글
  =============================== */
  const toggleSpecialty = (item) => {
    setSpecialties((prev) =>
      prev.includes(item)
        ? prev.filter((v) => v !== item)
        : [...prev, item]
    );
  };

  /* ===============================
     🔥 저장
  =============================== */
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    if (!realName.trim()) {
      alert("실명을 입력해주세요.");
      return;
    }

    setSaving(true);

    try {
      await updateDoc(doc(db, "users", user.uid), {
        realName: realName.trim(),
        specialties, // 🔥 배열 저장
      });

      alert("프로필이 저장되었습니다.");
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MainLayout title="상담사 프로필">
        불러오는 중...
      </MainLayout>
    );
  }

  return (
    <MainLayout title="상담사 프로필 설정">
      <div
        style={{
          maxWidth: "480px",
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          padding: "26px",
          borderRadius: "12px",
          marginBottom: "40px",
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: "20px",
            color: "var(--text)",
            fontWeight: 700,
            fontSize: "20px",
          }}
        >
          기본 정보
        </h2>

        {/* 실명 */}
        <label style={{ fontWeight: 600 }}>실명 (필수)</label>
        <input
          type="text"
          value={realName}
          onChange={(e) => setRealName(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            marginBottom: "20px",
          }}
        />

        {/* 전문 분야 */}
        <label style={{ fontWeight: 600 }}>
          전문 분야 (다중 선택 가능)
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            marginTop: "10px",
            marginBottom: "24px",
          }}
        >
          {SPECIALTY_OPTIONS.map((item) => (
            <label
              key={item}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={specialties.includes(item)}
                onChange={() => toggleSpecialty(item)}
              />
              {item}
            </label>
          ))}
        </div>

        {/* 저장 버튼 */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: "100%",
            padding: "13px",
            background: "var(--primary)",
            border: "none",
            borderRadius: "10px",
            color: "white",
            fontSize: "17px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {saving ? "저장 중..." : "프로필 저장"}
        </button>
      </div>
    </MainLayout>
  );
}