import "./Header.css";
import PushNotificationButton from "./PushNotificationButton";

export default function Header({ title, role, onMenuToggle }) {
  return (
    <header className="app-header">
      <div className="header-left-group">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onMenuToggle}
          aria-label="메뉴 열기"
        >
          ☰
        </button>
        <h1 className="header-title">{title}</h1>
      </div>

      <div className="header-right">
        <PushNotificationButton role={role} />
      </div>
    </header>
  );
}
