import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../config/firebase";
import { doc, getDoc } from "firebase/firestore";
import "../styles/Auth.css";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !pw) {
      alert("이메일과 비밀번호를 입력하세요.");
      return;
    }

    try {
      setLoading(true);

      const cred = await signInWithEmailAndPassword(
        auth,
        email,
        pw
      );

      const snap = await getDoc(
        doc(db, "users", cred.user.uid)
      );

      if (!snap.exists()) {
        alert("유저 정보가 존재하지 않습니다.");
        setLoading(false);
        return;
      }

      const role = snap.data().role;

      /* ===============================
         🔥 역할별 라우팅
      =============================== */
      switch (role) {
        case "admin":
          nav("/admin");
          break;

        case "counselor":
          nav("/counselor/dashboard");
          break;

        case "expert":
          nav("/community");
          break;

        case "user":
        default:
          nav("/home");
          break;
      }
    } catch (err) {
      console.error(err);
      alert("로그인 실패! 아이디 또는 비밀번호를 확인하세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLogin();
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <h2 className="auth-title">로그인</h2>

        <input
          className="auth-input"
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <input
          className="auth-input"
          type="password"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <button
          className="auth-btn"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>

        <div
          className="auth-link"
          onClick={() => nav("/signup")}
        >
          계정이 없나요? 회원가입 →
        </div>
      </div>
    </div>
  );
}