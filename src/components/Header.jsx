import "./Header.css";

export default function Header({ title }) {
  return (
    <header className="app-header">
      <h1 className="header-title">{title}</h1>

      <div className="header-right">
        {/* 필요하면 메뉴/아이콘 추가 */}
      </div>
    </header>
  );
}
