import { useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../config/firebase";

export default function AdminUsers({ role }) {
  const [staffUsers, setStaffUsers] = useState([]);
  const [appUsers, setAppUsers] = useState([]);
  const [selectedStaffRole, setSelectedStaffRole] = useState("admin");
  const [searchApp, setSearchApp] = useState("");
  const [loading, setLoading] = useState(false);

  if (role !== "admin") {
    return <div>접근 권한이 없습니다.</div>;
  }

  /* =====================================================
     🔥 쿠폰 차감
  ===================================================== */
  const deductCoupon = async (uid, couponId) => {
    if (!window.confirm("이 쿠폰을 차감하시겠습니까?")) return;

    try {
      await deleteDoc(doc(db, "app_users", uid, "coupons", couponId));

      setAppUsers((prev) =>
        prev.map((u) =>
          u.id === uid
            ? {
                ...u,
                coupons: u.coupons.filter((c) => c.id !== couponId),
              }
            : u
        )
      );

      alert("쿠폰이 차감되었습니다.");
    } catch (error) {
      console.error(error);
      alert("쿠폰 차감 실패");
    }
  };

  /* =====================================================
     🔥 관리자 / 상담사 / 전문가 역할별 조회
  ===================================================== */
  const loadStaffUsersByRole = async (targetRole) => {
    setSelectedStaffRole(targetRole);
    setLoading(true);

    try {
      const q = query(
        collection(db, "users"),
        where("role", "==", targetRole)
      );

      const snap = await getDocs(q);

      const results = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        role: d.data().role || "user",
        adminType: d.data().adminType || "",
      }));

      setStaffUsers(results);
    } catch (error) {
      console.error(error);
      alert("유저 검색 실패");
    } finally {
      setLoading(false);
    }
  };

  /* =====================================================
     🔥 일반 사용자 검색
  ===================================================== */
  const searchAppUsers = async () => {
    if (!searchApp.trim()) return;

    setLoading(true);

    try {
      const q = query(
        collection(db, "app_users"),
        where("nickname", "==", searchApp.trim())
      );

      const snap = await getDocs(q);

      const results = await Promise.all(
        snap.docs.map(async (d) => {
          const userData = { id: d.id, ...d.data() };

          const couponSnap = await getDocs(
            collection(db, "app_users", d.id, "coupons")
          );

          const coupons = couponSnap.docs.map((c) => ({
            id: c.id,
            ...c.data(),
          }));

          return { ...userData, coupons };
        })
      );

      setAppUsers(results);
    } catch (error) {
      console.error(error);
      alert("일반 사용자 검색 실패");
    } finally {
      setLoading(false);
    }
  };

  /* =====================================================
     🔥 역할 변경
  ===================================================== */
  const changeRole = async (uid, newRole) => {
    try {
      const updateData = { role: newRole };

      if (newRole !== "admin") {
        updateData.adminType = null;
      }

      await updateDoc(doc(db, "users", uid), updateData);

      setStaffUsers((prev) => prev.filter((u) => u.id !== uid));

      alert("권한이 변경되었습니다.");
    } catch (error) {
      console.error(error);
      alert("권한 변경 실패");
    }
  };

  /* =====================================================
     🔥 관리자 타입 변경
  ===================================================== */
  const changeAdminType = async (uid, newAdminType) => {
    try {
      await updateDoc(doc(db, "users", uid), {
        adminType: newAdminType,
      });

      setStaffUsers((prev) =>
        prev.map((u) =>
          u.id === uid ? { ...u, adminType: newAdminType } : u
        )
      );

      alert("관리자 유형이 변경되었습니다.");
    } catch (error) {
      console.error(error);
      alert("관리자 유형 변경 실패");
    }
  };

  /* =====================================================
     🔥 삭제
  ===================================================== */
  const deleteStaffUser = async (uid) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;

    try {
      await deleteDoc(doc(db, "users", uid));
      setStaffUsers((prev) => prev.filter((u) => u.id !== uid));
    } catch (error) {
      console.error(error);
      alert("삭제 실패");
    }
  };

  const deleteAppUser = async (uid) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;

    try {
      await deleteDoc(doc(db, "app_users", uid));
      setAppUsers((prev) => prev.filter((u) => u.id !== uid));
    } catch (error) {
      console.error(error);
      alert("삭제 실패");
    }
  };

  const roleLabelMap = {
    admin: "관리자",
    counselor: "상담사",
    expert: "전문가",
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>👑 유저 관리</h1>

      {loading && <p>검색 중...</p>}

      <h2>관리자 / 상담사 / 전문가 조회</h2>

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button
          onClick={() => loadStaffUsersByRole("admin")}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            backgroundColor:
              selectedStaffRole === "admin" ? "#111827" : "#fff",
            color: selectedStaffRole === "admin" ? "#fff" : "#111",
            cursor: "pointer",
          }}
        >
          관리자
        </button>

        <button
          onClick={() => loadStaffUsersByRole("counselor")}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            backgroundColor:
              selectedStaffRole === "counselor" ? "#111827" : "#fff",
            color: selectedStaffRole === "counselor" ? "#fff" : "#111",
            cursor: "pointer",
          }}
        >
          상담사
        </button>

        <button
          onClick={() => loadStaffUsersByRole("expert")}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            backgroundColor:
              selectedStaffRole === "expert" ? "#111827" : "#fff",
            color: selectedStaffRole === "expert" ? "#fff" : "#111",
            cursor: "pointer",
          }}
        >
          전문가
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <strong>
          현재 보기: {roleLabelMap[selectedStaffRole]} ({staffUsers.length})
        </strong>
      </div>

      {staffUsers.map((u) => (
        <div
          key={u.id}
          style={{
            marginTop: 20,
            padding: 15,
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        >
          <div><strong>{u.name || "이름 없음"}</strong></div>
          <div style={{ color: "#666" }}>{u.email}</div>
          <div style={{ fontSize: 12, color: "#aaa" }}>UID: {u.id}</div>
          <div style={{ marginTop: 6 }}>
            현재 role: <strong>{u.role || "user"}</strong>
          </div>

          {u.role === "admin" && (
            <div style={{ marginTop: 6 }}>
              현재 adminType: <strong>{u.adminType || "미설정"}</strong>
            </div>
          )}

          <select
            value={u.role ?? ""}
            onChange={(e) => changeRole(u.id, e.target.value)}
            style={{ marginTop: 10 }}
          >
            <option value="">선택</option>
            <option value="admin">admin</option>
            <option value="counselor">counselor</option>
            <option value="expert">expert</option>
            <option value="user">user</option>
          </select>

          {u.role === "admin" && (
            <select
              value={u.adminType || "general"}
              onChange={(e) => changeAdminType(u.id, e.target.value)}
              style={{ marginTop: 10, marginLeft: 10 }}
            >
              <option value="general">general admin</option>
              <option value="special">special admin</option>
            </select>
          )}

          <button
            onClick={() => deleteStaffUser(u.id)}
            style={{
              marginLeft: 10,
              backgroundColor: "#ff4d4f",
              color: "white",
              border: "none",
              padding: "6px 10px",
              borderRadius: 5,
            }}
          >
            삭제
          </button>
        </div>
      ))}

      <hr style={{ margin: "50px 0" }} />

      <h2>일반 사용자 검색</h2>

      <input
        type="text"
        placeholder="닉네임 정확히 입력"
        value={searchApp}
        onChange={(e) => setSearchApp(e.target.value)}
        style={{ padding: 8, width: 300 }}
      />

      <button onClick={searchAppUsers} style={{ marginLeft: 10 }}>
        검색
      </button>

      {appUsers.map((u) => (
        <div
          key={u.id}
          style={{
            marginTop: 20,
            padding: 15,
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        >
          <div><strong>{u.nickname || "닉네임 없음"}</strong></div>
          <div>이름: {u.name || "없음"}</div>
          <div>📞 {u.phone || "전화번호 없음"}</div>
          <div style={{ fontSize: 12, color: "#aaa" }}>UID: {u.id}</div>

          {u.coupons && u.coupons.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <strong>🎫 보유 쿠폰</strong>

              {u.coupons.map((coupon) => (
                <div
                  key={coupon.id}
                  style={{
                    marginTop: 5,
                    padding: 6,
                    backgroundColor: "#f5f5f5",
                    borderRadius: 6,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    {coupon.type === "consult_support" && "상담지원 쿠폰"}
                    {coupon.type === "lawyer_fee_30" && "선임료 30% 지원"}
                    {coupon.type === "lawyer_fee_50" && "선임료 50% 지원"}
                  </span>

                  <button
                    onClick={() => deductCoupon(u.id, coupon.id)}
                    style={{
                      backgroundColor: "#ff7875",
                      border: "none",
                      color: "white",
                      padding: "4px 8px",
                      borderRadius: 4,
                    }}
                  >
                    차감
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => deleteAppUser(u.id)}
            style={{
              marginTop: 10,
              backgroundColor: "#ff4d4f",
              color: "white",
              border: "none",
              padding: "6px 10px",
              borderRadius: 5,
            }}
          >
            삭제
          </button>
        </div>
      ))}
    </div>
  );
}
