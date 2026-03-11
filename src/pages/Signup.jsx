import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../config/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import "../styles/Auth.css";

export default function Signup() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isValid =
    email &&
    name &&
    pw.length >= 6 &&
    pw === pwConfirm;

  const handleSignup = async () => {
    if (!isValid) {
      setErrorMsg("입력 정보를 다시 확인해주세요.");
      return;
    }

    try {
      setLoading(true);
      setErrorMsg("");

      const userCred = await createUserWithEmailAndPassword(
        auth,
        email,
        pw
      );

      const uid = userCred.user.uid;

      await setDoc(doc(db, "users", uid), {
        email,
        name,
        nickname: name,
        realName: "",
        role: "user",
        profileImage: "",
        pushEnabled: true,
        createdAt: serverTimestamp(),
      });

      alert("🎉 회원가입이 완료되었습니다!");
      nav("/home");

    } catch (err) {
      console.error("회원가입 오류:", err);

      if (err.code === "auth/email-already-in-use") {
        setErrorMsg("이미 사용 중인 이메일입니다.");
      } else if (err.code === "auth/invalid-email") {
        setErrorMsg("올바른 이메일 형식이 아닙니다.");
      } else if (err.code === "auth/weak-password") {
        setErrorMsg("비밀번호는 6자 이상이어야 합니다.");
      } else {
        setErrorMsg("회원가입 중 오류가 발생했습니다.");
      }

    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !loading) {
      e.preventDefault();
      handleSignup();
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <h2 className="auth-title">회원가입</h2>

        <input
          className="auth-input"
          type="text"
          placeholder="이름 또는 닉네임"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />

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
          type={showPw ? "text" : "password"}
          placeholder="비밀번호 (6자 이상)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <input
          className="auth-input"
          type={showPw ? "text" : "password"}
          placeholder="비밀번호 확인"
          value={pwConfirm}
          onChange={(e) => setPwConfirm(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div
          style={{ fontSize: "13px", cursor: "pointer", marginBottom: "10px" }}
          onClick={() => setShowPw(!showPw)}
        >
          {showPw ? "🔒 비밀번호 숨기기" : "👁 비밀번호 보기"}
        </div>

        {pw && pw.length < 6 && (
          <div className="auth-error">
            비밀번호는 최소 6자 이상이어야 합니다.
          </div>
        )}

        {pwConfirm && pw !== pwConfirm && (
          <div className="auth-error">
            비밀번호가 일치하지 않습니다.
          </div>
        )}

        {errorMsg && (
          <div className="auth-error">{errorMsg}</div>
        )}

        <button
          className="auth-btn"
          onClick={handleSignup}
          disabled={!isValid || loading}
        >
          {loading ? "가입 중..." : "회원가입"}
        </button>

        <div
          className="auth-link"
          onClick={() => nav("/login")}
        >
          이미 계정이 있으신가요? 로그인 →
        </div>
      </div>
    </div>
  );
}