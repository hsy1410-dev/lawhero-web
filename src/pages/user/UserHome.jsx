import MainLayout from "../../layouts/MainLayout";
import { Link } from "react-router-dom";

export default function UserHome() {
  return (
    <MainLayout title="내 상담">
      <p>내 상담 내역이 여기에 표시됩니다.</p>
      <Link to="/lawyers">변호사 목록과 매칭 횟수 확인하기</Link>
    </MainLayout>
  );
}
