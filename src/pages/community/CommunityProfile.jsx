import { useState, useEffect } from "react";
import { auth, db } from "../../config/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export default function CommunityProfile({ user }) {

  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {

      if (!user) return;

      const snap = await getDoc(
        doc(db, "users", user.uid)
      );

      if (snap.exists()) {
        setNickname(snap.data().nickname || "");
      }

    };

    loadProfile();
  }, [user]);

  const saveNickname = async () => {

    if (!nickname.trim()) {
      alert("닉네임을 입력하세요.");
      return;
    }

    try {

      setLoading(true);

      await updateDoc(
        doc(db, "users", user.uid),
        {
          nickname: nickname.trim()
        }
      );

      alert("닉네임이 수정되었습니다!");

    } catch (err) {

      console.error(err);
      alert("닉네임 수정 실패");

    } finally {
      setLoading(false);
    }

  };

  return (
    <div style={{ padding: 40 }}>

      <h2>커뮤니티 닉네임 설정</h2>

      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="닉네임 입력"
        style={{
          marginTop: 20,
          padding: 10,
          width: 300
        }}
      />

      <br/>

      <button
        onClick={saveNickname}
        disabled={loading}
        style={{
          marginTop: 20,
          padding: "10px 20px"
        }}
      >
        {loading ? "저장 중..." : "닉네임 저장"}
      </button>

    </div>
  );
}