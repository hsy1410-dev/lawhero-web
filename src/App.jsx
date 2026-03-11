// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";

// Auth
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AdminSupport from "./pages/admin/AdminSupport";
// Admin
import AdminDashboard from "./pages/admin/AdminDashboard";
import ConsultationDetail from "./pages/admin/ConsultationDetail";
import AdminNotice from "./pages/admin/AdminNotice";
import Adminusers from "./pages/admin/users";
// Counselor
import CounselorDashboard from "./pages/counselor/CounselorDashboard";
import CounselorProfile from "./pages/counselor/CounselorProfile";
import ChatRoom from "./pages/counselor/ChatRoom";
import CommunityProfile from "./pages/community/CommunityProfile";
// User
import UserHome from "./pages/user/UserHome";

// Community
import CommunityList from "./pages/community/CommunityList";
import CommunityDetail from "./pages/community/CommunityDetail";
import CommunityWrite from "./pages/community/CommunityWrite";

// Utils
import useFcmToken from "./hooks/useFcmToken";
import { withRole } from "./utils/withRole";

// Firebase
import { auth, db } from "./config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import AdminCounselors from "./pages/admin/counselors";
import KakaoCallback from "./pages/KakaoCallback";
/* ===============================
   🔐 보호된 페이지 고정 선언
=============================== */

const Admin = withRole(AdminDashboard, "admin");
const AdminNoticePage = withRole(AdminNotice, "admin");
const AdminConsultDetail = withRole(
  ConsultationDetail,
  "admin"
);
const AdminCounselorsPage = withRole(
  AdminCounselors,
  "admin"
);
const AdminSupportPage = withRole(
  AdminSupport,
  "admin"
);
const Counselor = withRole(
  CounselorDashboard,
  "counselor"
);
const CounselorProfilePage = withRole(
  CounselorProfile,
  "counselor"
);
const CounselorChatPage = withRole(
  ChatRoom,
  ["admin", "counselor"]
);

const User = withRole(UserHome, "user");

const ExpertCommunityWrite = withRole(
  CommunityWrite,
  "expert"
);

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
const isKakaoCallback =
  window.location.pathname === "/auth/kakao/callback";
 /* ===============================
   🔥 1️⃣ Auth 상태 관리
================================ */
useEffect(() => {
  const unsub = onAuthStateChanged(auth, (u) => {
    setUser(u);
    setAuthLoading(false);
  });

  return () => unsub();
}, []);


/* ===============================
   🔥 2️⃣ 로그인 후 role 로딩
================================ */
useEffect(() => {
  if (!user?.uid) {
    setRole(null);
    return;
  }

  const loadRole = async () => {
    try {
      setRoleLoading(true);

      const snap = await getDoc(doc(db, "users", user.uid));

      if (snap.exists()) {
        const r = snap.data().role;
        setRole(r);
      } else {
        setRole(null);
      }
    } catch (err) {
      console.error("🔥 role 로딩 실패:", err);
      setRole(null);
    } finally {
      setRoleLoading(false);
    }
  };

  loadRole();
}, [user]);
  /* ===============================
     🔥 3️⃣ Service Worker 등록
  =============================== */
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/firebase-messaging-sw.js")
        .then((reg) =>
          console.log("🔥 SW registered:", reg.scope)
        )
        .catch((err) =>
          console.error("❌ SW registration failed:", err)
        );
    }
  }, []);

  /* ===============================
     🔔 FCM 토큰 저장
  =============================== */
  useFcmToken(
    user && role
      ? {
          uid: user.uid,
          role,
        }
      : null
  );

  /* ===============================
     🔄 로딩 처리
  =============================== */
  if (!isKakaoCallback && (authLoading || (user && roleLoading))) {
  return (
    <div className="loading-screen">
      🔄 정보를 불러오는 중입니다...
    </div>
  );
}

  return (
    <>
     

      <BrowserRouter>

        {user && (
          <header className="top-header">
            <h2 className="top-header-title">
              law hero web
            </h2>
          </header>
        )}

        <Routes>
  {/* Auth */}
  <Route path="/" element={<Login />} />
  <Route path="/login" element={<Login />} />
  <Route path="/signup" element={<Signup />} />
<Route
  path="/auth/kakao/callback"
  element={<KakaoCallback />}
/>
  {/* Admin */}
  <Route
    path="/admin"
    element={<Admin user={user} role={role} />}
  />
  <Route
  path="/admin/support"
  element={<AdminSupportPage user={user} role={role} />}
/>
  <Route
    path="/admin/consult/:id"
    element={<AdminConsultDetail user={user} role={role} />}
  />
  <Route
    path="/admin/notice"
    element={<AdminNoticePage user={user} role={role} />}
  />
  <Route path="/admin/users" element={<Adminusers user={user} role={role}/>}/>
  <Route
  path="/admin/counselors"
  element={<AdminCounselorsPage user={user} role={role} />}
/>

  {/* Counselor */}
  <Route
    path="/counselor/dashboard"
    element={<Counselor user={user} role={role} />}
  />
  <Route
    path="/counselor/profile"
    element={<CounselorProfilePage user={user} role={role} />}
  />
  <Route
    path="/counselor/chat/:id"
    element={<CounselorChatPage user={user} role={role} />}
  />

  {/* User */}
  <Route
    path="/home"
    element={<User user={user} role={role} />}
  />

  {/* Community */}
  <Route
    path="/community"
    element={<CommunityList />}
  />
  <Route
    path="/community/write"
    element={<ExpertCommunityWrite user={user} role={role} />}
  />
  <Route
    path="/community/:id"
    element={<CommunityDetail />}
  />
  <Route
  path="/community/profile"
  element={<CommunityProfile user={user} role={role} />}
/>

  {/* 403 */}
  <Route
    path="/403"
    element={
      <div style={{ padding: 40 }}>
        🚫 접근 권한이 없습니다.
      </div>
    }
  />

  {/* 404 */}
  <Route
    path="*"
    element={
      <div style={{ padding: 40 }}>
        🚫 페이지를 찾을 수 없습니다.
      </div>
    }
  />
</Routes>
      </BrowserRouter>
    </>
  );
}

export default App;