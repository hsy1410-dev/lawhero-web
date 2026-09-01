import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth } from "../config/firebase";
import "./Sidebar.css";

export default function Sidebar({ role, isOpen = false, onClose = () => {} }) {
  const location = useLocation();
  const nav = useNavigate();
  const path = location.pathname;

  const isActive = (route) =>
    route === "/admin" ? path === route : path.startsWith(route);

  const handleLogout = async () => {
    await auth.signOut();
    nav("/login");
  };
console.log("🔥 Sidebar role:", role);
  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`} aria-label="주 메뉴">
      <h2 className="side-title">law hero web</h2>

      {/* ===================== 관리자 ===================== */}
      {role === "admin" && (
  <>
    <Link
      className={isActive("/admin") ? "active" : ""}
      to="/admin"
      onClick={onClose}
    >
      📊 대시보드
    </Link>

    <Link
      className={isActive("/admin/users") ? "active" : ""}
      to="/admin/users"
      onClick={onClose}
    >
      👥 유저 관리
    </Link>

    <Link
      className={isActive("/admin/counselors") ? "active" : ""}
      to="/admin/counselors"
      onClick={onClose}
    >
      ⭐ 상담사 관리
    </Link>
    <Link
      className={isActive("/admin/lawyers") ? "active" : ""}
      to="/admin/lawyers"
      onClick={onClose}
    >
      ⚖️ 변호사 관리
    </Link>
    <Link
      className={isActive("/admin/support") ? "active" : ""}
      to="/admin/support"
      onClick={onClose}
    >
      🛟 고객센터
    </Link>

    <Link
      className={isActive("/admin/notice") ? "active" : ""}
      to="/admin/notice"
      onClick={onClose}
    >
      📢 공지사항
    </Link>
  </>
)}

      {/* ===================== 상담사 ===================== */}
      {role === "counselor" && (
        <>
          <Link
            className={isActive("/counselor/dashboard") ? "active" : ""}
            to="/counselor/dashboard"
            onClick={onClose}
          >
            💼 상담방 목록
          </Link>

          <Link
            className={isActive("/counselor/profile") ? "active" : ""}
            to="/counselor/profile"
            onClick={onClose}
          >
            🙍‍♂️ 내 프로필
          </Link>
        </>
      )}

      {/* ===================== 전문가 ===================== */}
      {(role === "expert" || role === "admin") && (
  <>
    <Link
      className={isActive("/community") ? "active" : ""}
      to="/community"
      onClick={onClose}
    >
      🌐 커뮤니티
    </Link>
    <Link
      className={isActive("/community/profile") ? "active" : ""}
      to="/community/profile"
      onClick={onClose}
    >
      👤 프로필
    </Link>
  </>
)}

      {/* ===================== 일반 사용자 ===================== */}
      {role === "user" && (
        <>
          <Link
            className={isActive("/home") ? "active" : ""}
            to="/home"
            onClick={onClose}
          >
            📁 내 상담
          </Link>

          <Link
            className={isActive("/community") ? "active" : ""}
            to="/community"
            onClick={onClose}
          >
            🌐 커뮤니티
          </Link>
        </>
      )}

      {/* ===================== 공통 로그아웃 ===================== */}
      <button className="logout-btn" onClick={handleLogout}>
        🚪 로그아웃
      </button>
    </aside>
  );
}
