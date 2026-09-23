import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../config/firebase";
import "../styles/Auth.css";

const successMessage =
  "입력하신 이메일로 가입된 계정이 있다면 비밀번호 재설정 메일이 전송됩니다. 메일의 링크를 눌러 새 비밀번호를 설정해 주세요. 메일이 보이지 않으면 스팸함도 확인해 주세요.";

export default function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email?.trim() || "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const resetEmail = email.trim();
    if (!resetEmail) {
      setError("가입할 때 사용한 이메일을 입력해 주세요.");
      return;
    }

    setLoading(true);
    setSent(false);
    setError("");

    try {
      auth.languageCode = "ko";
      await sendPasswordResetEmail(auth, resetEmail);
      setSent(true);
    } catch (err) {
      switch (err.code) {
        case "auth/user-not-found":
          // 계정 가입 여부에 관계없이 동일한 안내를 표시합니다.
          setSent(true);
          break;
        case "auth/invalid-email":
          setError("올바른 이메일 주소를 입력해 주세요.");
          break;
        case "auth/too-many-requests":
          setError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
          break;
        case "auth/network-request-failed":
          setError("인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
          break;
        default:
          setError("메일을 전송하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <h2 className="auth-title">비밀번호 재설정</h2>
        <p className="auth-description" id="reset-description">
          가입할 때 사용한 이메일을 입력하시면 비밀번호를 재설정할 수 있는
          링크를 보내드립니다.
        </p>

        <form onSubmit={handleSubmit} aria-busy={loading}>
          <label className="auth-label" htmlFor="reset-email">
            이메일
          </label>
          <input
            id="reset-email"
            className="auth-input"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="example@email.com"
            aria-describedby={`reset-description${error ? " reset-error" : ""}`}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setSent(false);
              setError("");
            }}
            disabled={loading}
            required
          />

          {error && (
            <p className="auth-message auth-message-error" id="reset-error" role="alert">
              {error}
            </p>
          )}
          {sent && (
            <p className="auth-message" role="status">
              {successMessage}
            </p>
          )}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading
              ? "전송 중..."
              : sent
                ? "재설정 이메일 다시 보내기"
                : "비밀번호 재설정 이메일 보내기"}
          </button>
        </form>

        <Link className="auth-link auth-navigation-link" to="/login">
          로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
