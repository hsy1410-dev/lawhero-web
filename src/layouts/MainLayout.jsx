import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebase";
import { doc, getDoc } from "firebase/firestore";
import "../styles/layout.css";

export default function MainLayout({ children, title }) {
  const [role, setRole] = useState(null);

  useEffect(() => {
    let alive = true;

    async function loadUserRole() {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));

        if (!alive) return;

        if (snap.exists()) {
          // ✅ 여기 핵심: role 필드
          const r = (snap.data().role || "").trim().toLowerCase();
          setRole(r || null);
        } else {
          setRole(null);
        }
      } catch (e) {
        console.error("❌ role load error:", e);
        setRole(null);
      }
    }

    loadUserRole();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="layout-wrapper">
      <Sidebar role={role} />

      <div className="content-wrapper">
        <Header title={title} />

        <div className="page-container">{children}</div>
      </div>
    </div>
  );
}